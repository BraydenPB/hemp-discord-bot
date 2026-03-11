/**
 * Discussion Prompt Generator
 */

const DISCUSSION_TOPICS = [
  {
    theme: 'Wellness & Medicinal Uses',
    prompts: [
      'Have you ever tried hemp or CBD for something like sleep, anxiety, or pain? What was your experience — did it help, and how long did it take to notice anything?',
      'The endocannabinoid system is something most of us were never taught about in school. What\'s one thing about it that surprised you when you first learned it?',
      'CBD, CBG, CBN, CBC — there are so many cannabinoids. If you\'ve tried more than one, did you notice different effects? Which one has been most interesting to you?'
    ]
  },
  {
    theme: 'Hemp 101',
    prompts: [
      'What\'s something about hemp that you wish more people understood? A lot of folks still confuse it with marijuana — how do you explain the difference to someone new?',
      'Hemp has been used by humans for thousands of years — rope, clothing, food, medicine. What use of hemp surprised you the most when you first discovered it?',
      'If you could go back and give yourself one piece of advice when you were first learning about hemp, what would it be?'
    ]
  },
  {
    theme: 'Science & Research',
    prompts: [
      'Research on cannabinoids is still pretty new compared to other medicines. Is there a specific condition or use case you\'d love to see more clinical studies on?',
      'The entourage effect — the idea that cannabinoids work better together than in isolation — is fascinating. Have you noticed a difference between full-spectrum and isolate products?',
      'Hemp seeds are packed with omega-3s, complete proteins, and more. Did you know about the nutritional side of hemp before joining this community? What got you interested?'
    ]
  },
  {
    theme: 'Hemp & The Environment',
    prompts: [
      'Hemp is often called one of the most eco-friendly crops on earth — it improves soil, needs little water, and absorbs CO₂. Did you know this before getting into hemp? What drew you in?',
      'Hempcrete, hemp plastic, hemp fabric — industrial hemp could replace a lot of environmentally harmful materials. Which application do you think has the most potential?',
      'If hemp farming became mainstream in your region, what do you think the biggest positive impact on the local environment would be?'
    ]
  },
  {
    theme: 'Your Hemp Journey',
    prompts: [
      'Everyone starts somewhere! What first got you curious about hemp — was it for wellness, curiosity, sustainability, or something else entirely?',
      'Has hemp changed anything in your daily routine or lifestyle? Even small things count — like adding hemp seeds to breakfast or using a CBD balm.',
      'What\'s a question about hemp you had early on that took you a while to find a good answer to? Let\'s help someone else who might be wondering the same thing!'
    ]
  }
];

const GREETINGS = [
  'Good morning, everyone! ☀️',
  'Hey hemp community! 🌿',
  'Happy Hemp Day! 🌱',
  'Good morning! Pull up a chair — let\'s learn something together. 🌾',
  'Morning! No question is too basic here — let\'s dig in. 💚'
];

// Returns date parts in Central time without relying on toLocaleDateString
function getCentralDateParts() {
  // CDT = UTC-5, CST = UTC-6
  // Approximate with UTC-5 (CDT) — close enough for display
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

export async function generateDiscussionPrompt() {
  const { dayName, dayNum, month, year, dayOfWeek } = getCentralDateParts();

  const topicIndex = dayOfWeek % DISCUSSION_TOPICS.length;
  const topic = DISCUSSION_TOPICS[topicIndex];
  const prompt = topic.prompts[dayNum % topic.prompts.length];
  const greeting = GREETINGS[dayNum % GREETINGS.length];

  return {
    theme: topic.theme,
    question: `${greeting}\n\n${prompt}`,
    threadTitle: `${dayName} Discussion — ${month} ${dayNum}`,
    date: `${dayName}, ${month} ${dayNum}, ${year}`
  };
}

export { DISCUSSION_TOPICS };
