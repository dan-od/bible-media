import type { Passage } from './types';

/**
 * Seed passage set — verified King James Version text (public domain).
 *
 * Each passage is a RANGE that forms one complete thought (1–3 verses) with the
 * verse immediately before it kept as `leadIn` for the dimmed lead-in line.
 * KJV is the bundled translation for this step; a couple of passages also carry
 * BSB/WEB text (verbatim) so the compare sheet has real alternates. Full BSB and
 * WEB text for every passage arrives with the translation-ingestion pass.
 *
 * Theme tags use a consistent Title-Case vocabulary and cover every onboarding
 * "what's on your heart" theme.
 */
export const PASSAGES: Passage[] = [
  {
    id: 'psalm-31-24',
    book: 'Psalm',
    chapter: 31,
    verseStart: 24,
    verseEnd: 24,
    reference: 'Psalm 31:24',
    themeTags: ['Courage', 'New job', 'Fear'],
    leadInVerse: 23,
    text: {
      KJV: {
        leadIn: {
          number: 23,
          text: 'O love the LORD, all ye his saints: for the LORD preserveth the faithful, and plentifully rewardeth the proud doer.',
        },
        verses: [
          {
            number: 24,
            text: 'Be of good courage, and he shall strengthen your heart, all ye that hope in the LORD.',
          },
        ],
      },
      BSB: {
        verses: [{ number: 24, text: 'Be strong and courageous, all you who hope in the LORD.' }],
      },
      WEB: {
        verses: [
          { number: 24, text: 'Be strong, and let your heart take courage, yes, all you who hope in Yahweh.' },
        ],
      },
    },
    context: {
      facts: [
        { label: 'Who is speaking', body: 'David, according to the psalm’s heading: “A Psalm of David.”' },
        {
          label: 'Who it is for',
          body: '“All ye that hope in the LORD” — anyone trusting God through a hard season.',
        },
        {
          label: 'How it moves',
          body: 'From distress in verses 9–13, to trust in verse 14, “But I trusted in thee,” to this closing encouragement.',
        },
        {
          label: 'Jesus quotes it',
          body: 'Verse 5, “Into thine hand I commit my spirit,” is among His words on the cross (Luke 23:46).',
        },
      ],
      readAlongside: ['Joshua 1:9', 'Isaiah 40:31'],
    },
  },
  {
    id: 'joshua-1-9',
    book: 'Joshua',
    chapter: 1,
    verseStart: 9,
    verseEnd: 9,
    reference: 'Joshua 1:9',
    themeTags: ['Courage', 'Fear', 'New job'],
    leadInVerse: 8,
    text: {
      KJV: {
        leadIn: {
          number: 8,
          text: 'This book of the law shall not depart out of thy mouth; but thou shalt meditate therein day and night, that thou mayest observe to do according to all that is written therein: for then thou shalt make thy way prosperous, and then thou shalt have good success.',
        },
        verses: [
          {
            number: 9,
            text: 'Have not I commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.',
          },
        ],
      },
    },
  },
  {
    id: 'isaiah-40-31',
    book: 'Isaiah',
    chapter: 40,
    verseStart: 31,
    verseEnd: 31,
    reference: 'Isaiah 40:31',
    themeTags: ['Waiting', 'Strength', 'Weariness'],
    leadInVerse: 30,
    text: {
      KJV: {
        leadIn: {
          number: 30,
          text: 'Even the youths shall faint and be weary, and the young men shall utterly fall:',
        },
        verses: [
          {
            number: 31,
            text: 'But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint.',
          },
        ],
      },
    },
  },
  {
    id: 'philippians-4-6-7',
    book: 'Philippians',
    chapter: 4,
    verseStart: 6,
    verseEnd: 7,
    reference: 'Philippians 4:6–7',
    themeTags: ['Anxiety', 'Worry', 'Peace'],
    leadInVerse: 5,
    text: {
      KJV: {
        leadIn: { number: 5, text: 'Let your moderation be known unto all men. The Lord is at hand.' },
        verses: [
          {
            number: 6,
            text: 'Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God.',
          },
          {
            number: 7,
            text: 'And the peace of God, which passeth all understanding, shall keep your hearts and minds through Christ Jesus.',
          },
        ],
      },
    },
  },
  {
    id: 'matthew-6-25-27',
    book: 'Matthew',
    chapter: 6,
    verseStart: 25,
    verseEnd: 27,
    reference: 'Matthew 6:25–27',
    themeTags: ['Worry', 'Money', 'Provision', 'Anxiety'],
    leadInVerse: 24,
    text: {
      KJV: {
        leadIn: {
          number: 24,
          text: 'No man can serve two masters: for either he will hate the one, and love the other; or else he will hold to the one, and despise the other. Ye cannot serve God and mammon.',
        },
        verses: [
          {
            number: 25,
            text: 'Therefore I say unto you, Take no thought for your life, what ye shall eat, or what ye shall drink; nor yet for your body, what ye shall put on. Is not the life more than meat, and the body than raiment?',
          },
          {
            number: 26,
            text: 'Behold the fowls of the air: for they sow not, neither do they reap, nor gather into barns; yet your heavenly Father feedeth them. Are ye not much better than they?',
          },
          {
            number: 27,
            text: 'Which of you by taking thought can add one cubit unto his stature?',
          },
        ],
      },
    },
  },
  {
    id: 'first-timothy-6-6-8',
    book: '1 Timothy',
    chapter: 6,
    verseStart: 6,
    verseEnd: 8,
    reference: '1 Timothy 6:6–8',
    themeTags: ['Money', 'Contentment', 'Thankful'],
    leadInVerse: 5,
    text: {
      KJV: {
        leadIn: {
          number: 5,
          text: 'Perverse disputings of men of corrupt minds, and destitute of the truth, supposing that gain is godliness: from such withdraw thyself.',
        },
        verses: [
          { number: 6, text: 'But godliness with contentment is great gain.' },
          {
            number: 7,
            text: 'For we brought nothing into this world, and it is certain we can carry nothing out.',
          },
          { number: 8, text: 'And having food and raiment let us be therewith content.' },
        ],
      },
    },
  },
  {
    id: 'john-15-5',
    book: 'John',
    chapter: 15,
    verseStart: 5,
    verseEnd: 5,
    reference: 'John 15:5',
    themeTags: ['Purpose', 'Faith doubts'],
    leadInVerse: 4,
    text: {
      KJV: {
        leadIn: {
          number: 4,
          text: 'Abide in me, and I in you. As the branch cannot bear fruit of itself, except it abide in the vine; no more can ye, except ye abide in me.',
        },
        verses: [
          {
            number: 5,
            text: 'I am the vine, ye are the branches: He that abideth in me, and I in him, the same bringeth forth much fruit: for without me ye can do nothing.',
          },
        ],
      },
    },
  },
  {
    id: 'psalm-37-25',
    book: 'Psalm',
    chapter: 37,
    verseStart: 25,
    verseEnd: 25,
    reference: 'Psalm 37:25',
    themeTags: ['Provision', 'Money'],
    leadInVerse: 24,
    text: {
      KJV: {
        leadIn: {
          number: 24,
          text: 'Though he fall, he shall not be utterly cast down: for the LORD upholdeth him with his hand.',
        },
        verses: [
          {
            number: 25,
            text: 'I have been young, and now am old; yet have I not seen the righteous forsaken, nor his seed begging bread.',
          },
        ],
      },
    },
  },
  {
    id: 'lamentations-3-22-23',
    book: 'Lamentations',
    chapter: 3,
    verseStart: 22,
    verseEnd: 23,
    reference: 'Lamentations 3:22–23',
    themeTags: ['Grief', 'Thankful', 'Hope'],
    leadInVerse: 21,
    text: {
      KJV: {
        leadIn: { number: 21, text: 'This I recall to my mind, therefore have I hope.' },
        verses: [
          {
            number: 22,
            text: 'It is of the LORD’s mercies that we are not consumed, because his compassions fail not.',
          },
          { number: 23, text: 'They are new every morning: great is thy faithfulness.' },
        ],
      },
    },
  },
  {
    id: 'psalm-34-18',
    book: 'Psalm',
    chapter: 34,
    verseStart: 18,
    verseEnd: 18,
    reference: 'Psalm 34:18',
    themeTags: ['Grief', 'A breakup', 'Loneliness'],
    leadInVerse: 17,
    text: {
      KJV: {
        leadIn: {
          number: 17,
          text: 'The righteous cry, and the LORD heareth, and delivereth them out of all their troubles.',
        },
        verses: [
          {
            number: 18,
            text: 'The LORD is nigh unto them that are of a broken heart; and saveth such as be of a contrite spirit.',
          },
        ],
      },
    },
  },
  {
    id: 'deuteronomy-31-6',
    book: 'Deuteronomy',
    chapter: 31,
    verseStart: 6,
    verseEnd: 6,
    reference: 'Deuteronomy 31:6',
    themeTags: ['Courage', 'Loneliness', 'Fear'],
    leadInVerse: 5,
    text: {
      KJV: {
        leadIn: {
          number: 5,
          text: 'And the LORD shall give them up before your face, that ye may do unto them according unto all the commandments which I have commanded you.',
        },
        verses: [
          {
            number: 6,
            text: 'Be strong and of a good courage, fear not, nor be afraid of them: for the LORD thy God, he it is that doth go with thee; he will not fail thee, nor forsake thee.',
          },
        ],
      },
    },
  },
  {
    id: 'hebrews-12-11',
    book: 'Hebrews',
    chapter: 12,
    verseStart: 11,
    verseEnd: 11,
    reference: 'Hebrews 12:11',
    themeTags: ['Discipline'],
    leadInVerse: 10,
    text: {
      KJV: {
        leadIn: {
          number: 10,
          text: 'For they verily for a few days chastened us after their own pleasure; but he for our profit, that we might be partakers of his holiness.',
        },
        verses: [
          {
            number: 11,
            text: 'Now no chastening for the present seemeth to be joyous, but grievous: nevertheless afterward it yieldeth the peaceable fruit of righteousness unto them which are exercised thereby.',
          },
        ],
      },
    },
  },
];
