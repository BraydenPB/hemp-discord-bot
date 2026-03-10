/**
 * Discussion Prompt Generator
 * Creates engaging discussion topics based on hemp research
 */

const DISCUSSION_TOPICS = [
  {
    theme: 'Regulatory Updates',
    prompts: [
      'What are your thoughts on the latest hemp regulations?',
      'How will the 2026 Farm Bill changes affect your business?',
      'What regulatory hurdles are you facing in your state?'
    ]
  },
  {
    theme: 'Industry Trends',
    prompts: [
      'What hemp trends are you most excited about this year?',
      'Which hemp product categories do you think will grow the most?',
      'How is technology changing the hemp industry?'
    ]
  },
  {
    theme: 'Cultivation & Processing',
    prompts: [
      'What cultivation techniques have been working best for you?',
      'How do you handle post-harvest processing?',
      'What genetics are you excited about this season?'
    ]
  },
  {
    theme: 'Business & Market',
    prompts: [
      'What challenges are you facing in the hemp market?',
      'How do you see the market evolving over the next year?',
      'What advice would you give to new hemp entrepreneurs?'
    ]
  },
  {
    theme: 'Sustainability',
    prompts: [
      'How can hemp contribute to sustainable manufacturing?',
      'What environmental benefits of hemp are most underappreciated?',
      'How do you practice sustainability in your hemp operations?'
    ]
  }
];

const TIME_GREETINGS = [
  'Good morning, hemp community!',
  'Rise and grind, hemp enthusiasts!',
  'Happy Hemp Day, everyone!',
  'Good morning! Time for our daily hemp discussion.',
  'Wake and bake... knowledge! Good morning!'
];

export async function generateDiscussionPrompt(research) {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Select topic based on day of week (rotating)
  const topicIndex = dayOfWeek % DISCUSSION_TOPICS.length;
  const selectedTopic = DISCUSSION_TOPICS[topicIndex];

  // Random prompt from selected topic
  const promptIndex = Math.floor(today.getDate() % selectedTopic.prompts.length);
  const selectedPrompt = selectedTopic.prompts[promptIndex];

  // Random greeting
  const greetingIndex = today.getDate() % TIME_GREETINGS.length;
  const greeting = TIME_GREETINGS[greetingIndex];

  // Build the message
  const messageParts = [
    `## ${greeting}`,
    `**Daily Discussion - ${dayNames[dayOfWeek]}, ${today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}**`,
    '',
    `### ${selectedTopic.theme}`,
    selectedPrompt,
    ''
  ];

  // Add research highlights if available
  if (research && research.articles && research.articles.length > 0) {
    messageParts.push('---');
    messageParts.push('### In Today\'s News:');
    research.articles.slice(0, 3).forEach((article, i) => {
      messageParts.push(`${i + 1}. [${article.title}](${article.link})`);
    });
    messageParts.push('');
  }

  messageParts.push('*Join the thread below to share your thoughts!*');

  return {
    message: messageParts.join('\n'),
    threadTitle: `${dayNames[dayOfWeek]} Discussion - ${today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
    threadStart: `Welcome to today's discussion thread!\n\n${selectedPrompt}\n\nShare your thoughts, experiences, or questions below. Let's keep it constructive and informative!`
  };
}

export { DISCUSSION_TOPICS, TIME_GREETINGS };
