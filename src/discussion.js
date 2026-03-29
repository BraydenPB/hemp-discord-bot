/**
 * Discussion Prompt Generator
 * Uses KV-backed history to avoid repeats and optional AI rewriting for natural tone.
 */

const TOGETHER_API_URL = 'https://api.together.xyz/v1/chat/completions';
const MODEL = 'meta-llama/Llama-3.3-70B-Instruct-Turbo';

const DISCUSSION_TOPICS = [
  {
    theme: 'Wellness & Medicinal Uses',
    prompts: [
      'Have you tried hemp or CBD for sleep, anxiety, or pain? What was your experience, and how long before you noticed anything?',
      'The endocannabinoid system is something most of us never learned about in school. What surprised you most when you first heard about it?',
      'CBD, CBG, CBN, CBC — if you\'ve tried more than one cannabinoid, did you notice different effects? Which has been most interesting to you?'
    ]
  },
  {
    theme: 'Hemp 101',
    prompts: [
      'What\'s something about hemp you wish more people understood? How do you explain the difference between hemp and marijuana to someone new?',
      'Hemp has been used for thousands of years — rope, clothing, food, medicine. Which use surprised you most when you first discovered it?',
      'If you could go back and give yourself one piece of advice when you were first learning about hemp, what would it be?'
    ]
  },
  {
    theme: 'Science & Research',
    prompts: [
      'Cannabinoid research is still young compared to other fields. Is there a specific condition or use case you\'d like to see more clinical studies on?',
      'The entourage effect — the idea that cannabinoids work better together than in isolation — is a big topic. Have you noticed a difference between full-spectrum and isolate products?',
      'Hemp seeds are packed with omega-3s and complete proteins. Did you know about the nutritional side before joining this community?'
    ]
  },
  {
    theme: 'Hemp & The Environment',
    prompts: [
      'Hemp improves soil, needs little water, and absorbs CO2. Did you know about its environmental side before getting into hemp?',
      'Hempcrete, hemp plastic, hemp fabric — industrial hemp could replace a lot of harmful materials. Which application do you think has the most potential?',
      'If hemp farming became mainstream in your region, what do you think the biggest positive environmental impact would be?'
    ]
  },
  {
    theme: 'Your Hemp Journey',
    prompts: [
      'What first got you curious about hemp — wellness, sustainability, curiosity, or something else entirely?',
      'Has hemp changed anything in your daily routine? Even small things count — hemp seeds at breakfast, a CBD balm, anything.',
      'What\'s a question about hemp you had early on that took a while to find a good answer to?'
    ]
  }
];

const INTROS = [
  'This week\'s question:',
  'Let\'s talk about this:',
  'Curious how you all feel about this:',
  'Something worth discussing:',
  'Here\'s one for the community:',
];

// Flatten all prompts into a single indexed list
const ALL_PROMPTS = DISCUSSION_TOPICS.flatMap((topic, tIndex) =>
  topic.prompts.map((text, pIndex) => ({
    id: `${tIndex}:${pIndex}`,
    theme: topic.theme,
    text,
  }))
);

const DISCUSSION_SYSTEM_PROMPT = `You write one thoughtful, grounded discussion question each week for an online hemp community. No emojis, no marketing language, no exclamation marks. Ask a single open-ended question in 1-2 sentences, like you're talking to peers, not customers.`;

async function aiRewritePrompt(basePrompt, theme, apiKey) {
  const res = await fetch(TOGETHER_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 120,
      temperature: 0.7,
      messages: [
        { role: 'system', content: DISCUSSION_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Theme: ${theme}\nBase idea: ${basePrompt}\n\nWrite one improved discussion question. Output only the question.`,
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`Together AI error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || basePrompt).trim();
}

// Returns date parts in Central time without relying on toLocaleDateString
function getCentralDateParts() {
  const now = new Date();
  const centralMs = now.getTime() - (5 * 60 * 60 * 1000);
  const d = new Date(centralMs);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return {
    dayName: days[d.getUTCDay()],
    dayNum: d.getUTCDate(),
    month: months[d.getUTCMonth()],
    year: d.getUTCFullYear(),
    dayOfWeek: d.getUTCDay()
  };
}

function randomItem(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export async function generateDiscussionPrompt(env) {
  const { dayName, dayNum, month, year } = getCentralDateParts();

  // Pick a prompt that hasn't been used recently (KV-backed history)
  let history = [];
  if (env?.HEMP_KV) {
    const raw = await env.HEMP_KV.get('discussion_history');
    history = raw ? JSON.parse(raw) : [];
  }

  const candidates = ALL_PROMPTS.filter(p => !history.includes(p.id));
  const choice = candidates.length ? randomItem(candidates) : randomItem(ALL_PROMPTS);

  // Store history — keep last 12 to avoid repeats for ~3 months of weekly posts
  if (env?.HEMP_KV) {
    const newHistory = [...history, choice.id].slice(-12);
    await env.HEMP_KV.put('discussion_history', JSON.stringify(newHistory));
  }

  // Optionally rewrite the prompt with AI for more natural phrasing
  let questionText = choice.text;
  if (env?.TOGETHER_API_KEY) {
    try {
      questionText = await aiRewritePrompt(choice.text, choice.theme, env.TOGETHER_API_KEY);
    } catch (e) {
      console.error('AI discussion rewrite failed:', e.message);
    }
  }

  const intro = randomItem(INTROS);

  return {
    theme: choice.theme,
    question: `${intro}\n\n${questionText}`,
    threadTitle: `${dayName} Discussion — ${month} ${dayNum}`,
    date: `${dayName}, ${month} ${dayNum}, ${year}`
  };
}

export { DISCUSSION_TOPICS, ALL_PROMPTS };
