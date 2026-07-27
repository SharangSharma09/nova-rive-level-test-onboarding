export interface LevelSentence {
  concept: string;
  sentence: string;
  expectedTranslation: string;
}

export const TAMIL_SENTENCES: LevelSentence[] = [
  {
    concept: "Present Tense",
    sentence: "நான் தினமும் பள்ளிக்கு போகிறேன்.",
    expectedTranslation: "I go to school every day.",
  },
  {
    concept: "Past Tense",
    sentence: "நேற்று அவன் சினிமா பார்த்தான்.",
    expectedTranslation: "He watched a movie yesterday.",
  },
  {
    concept: "Future Tense",
    sentence: "நாளை மழை பெய்யும்.",
    expectedTranslation: "It will rain tomorrow.",
  },
  {
    concept: "Pronouns",
    sentence: "அவள் என் அக்கா.",
    expectedTranslation: "She is my sister.",
  },
  {
    concept: "Articles",
    sentence: "ஒரு பூனை மரத்தின் மேல் இருக்கிறது.",
    expectedTranslation: "A cat is on the tree.",
  },
  {
    concept: "Adverbs",
    sentence: "குழந்தை மெதுவாக நடக்கிறது.",
    expectedTranslation: "The child walks slowly.",
  },
  {
    concept: "Time & Place",
    sentence: "புத்தகம் மேஜையின் கீழே உள்ளது.",
    expectedTranslation: "The book is under the table.",
  },
];

export const HINDI_SENTENCES: LevelSentence[] = [
  {
    concept: "Present Tense",
    sentence: "मैं रोज़ स्कूल जाता हूँ।",
    expectedTranslation: "I go to school every day.",
  },
  {
    concept: "Past Tense",
    sentence: "कल उसने फ़िल्म देखी।",
    expectedTranslation: "She watched a movie yesterday.",
  },
  {
    concept: "Future Tense",
    sentence: "कल बारिश होगी।",
    expectedTranslation: "It will rain tomorrow.",
  },
  {
    concept: "Pronouns",
    sentence: "वह मेरी बड़ी बहन है।",
    expectedTranslation: "She is my elder sister.",
  },
  {
    concept: "Articles",
    sentence: "एक बिल्ली पेड़ पर है।",
    expectedTranslation: "A cat is on the tree.",
  },
  {
    concept: "Adverbs",
    sentence: "बच्चा धीरे-धीरे चलता है।",
    expectedTranslation: "The child walks slowly.",
  },
  {
    concept: "Time & Place",
    sentence: "किताब मेज़ के नीचे है।",
    expectedTranslation: "The book is under the table.",
  },
];
