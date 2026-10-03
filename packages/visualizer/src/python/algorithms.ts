import type { Locale } from '../engine/captions';
import { MORE_ALGORITHMS } from './algorithms-more';

type Both = Record<Locale, string>;

export interface AlgorithmNotes {
  name: Both;
  idea: Both;
  /** What textbooks say, to compare with what was measured. */
  best: { growth: string; why: Both };
  worst: { growth: string; why: Both };
  watch: Both;
}

/** What detect.ts can find. Written once, checked against the measured counts in the tests. */
const BASICS: Record<string, AlgorithmNotes> = {
  'linear-search': {
    name: { en: 'Linear search', 'hi-Latn': 'Linear search' },
    idea: {
      en: 'Look at the items one by one until one matches or the list ends.',
      'hi-Latn': 'Items ko ek-ek karke dekho, jab tak match na mile ya list khatam na ho.',
    },
    best: {
      growth: 'O(1)',
      why: {
        en: 'The item is first: one comparison, whatever the size of the list.',
        'hi-Latn': 'Item pehle hi position par hai: list kitni bhi badi ho, 1 comparison.',
      },
    },
    worst: {
      growth: 'O(n)',
      why: {
        en: 'The item is last or missing: every one of the n items is checked.',
        'hi-Latn': 'Item aakhri hai ya hai hi nahi: saare n items check hote hain.',
      },
    },
    watch: {
      en: 'Watch the crossed-out cells: they are the work done. A match stops the loop early.',
      'hi-Latn':
        'Kate hue cells dekho: wahi kiya hua kaam hai. Match milte hi loop jaldi ruk jaata hai.',
    },
  },
  'binary-search': {
    name: { en: 'Binary search', 'hi-Latn': 'Binary search' },
    idea: {
      en: 'In a sorted list, look at the middle and throw away the half that cannot hold the item.',
      'hi-Latn':
        'Sorted list me beech wala item dekho aur woh aadha hissa chhod do jisme item ho hi nahi sakta.',
    },
    best: {
      growth: 'O(1)',
      why: {
        en: 'The item is exactly in the middle: found on the first look.',
        'hi-Latn': 'Item theek beech me hai: pehli baar me hi mil gaya.',
      },
    },
    worst: {
      growth: 'O(log n)',
      why: {
        en: 'Each look halves what is left, so 128 items need only about 7 looks.',
        'hi-Latn':
          'Har baar bacha hua hissa aadha hota hai, isliye 128 items me sirf lagbhag 7 baar dekhna padta hai.',
      },
    },
    watch: {
      en: 'Watch lo, mid and hi move: the search area shrinks by half each round. The list must be sorted.',
      'hi-Latn':
        'lo, mid aur hi ko chalte dekho: har round me search area aadha hota hai. List sorted honi chahiye.',
    },
  },
  'bubble-sort': {
    name: { en: 'Bubble sort', 'hi-Latn': 'Bubble sort' },
    idea: {
      en: 'Compare neighbours and swap them when they are in the wrong order; big items bubble to the end.',
      'hi-Latn':
        'Padosi items compare karo aur galat order me hon to swap karo; bade items end tak "bubble" ho jaate hain.',
    },
    best: {
      growth: 'O(n²)',
      why: {
        en: 'Without an early stop, even a sorted list is compared pair by pair on every pass. With a "no swaps, stop" check it becomes O(n).',
        'hi-Latn':
          'Jaldi rukne ka check na ho to sorted list bhi har pass me pair-pair compare hoti hai. "Koi swap nahi to ruko" check ho to O(n).',
      },
    },
    worst: {
      growth: 'O(n²)',
      why: {
        en: 'About n passes of about n comparisons each.',
        'hi-Latn': 'Lagbhag n pass, har pass me lagbhag n comparisons.',
      },
    },
    watch: {
      en: 'Watch the swaps: after each pass the biggest remaining item reaches its place at the end.',
      'hi-Latn':
        'Swaps dekho: har pass ke baad bacha hua sabse bada item end me apni jagah pahunch jaata hai.',
    },
  },
  'selection-sort': {
    name: { en: 'Selection sort', 'hi-Latn': 'Selection sort' },
    idea: {
      en: 'Find the smallest remaining item and swap it to the front, one position at a time.',
      'hi-Latn':
        'Bache hue items me sabse chhota dhoondho aur use aage swap karo, ek-ek position karke.',
    },
    best: {
      growth: 'O(n²)',
      why: {
        en: 'It always scans the whole rest of the list, sorted or not.',
        'hi-Latn': 'List sorted ho ya nahi, yeh hamesha baaki poori list scan karta hai.',
      },
    },
    worst: {
      growth: 'O(n²)',
      why: {
        en: 'n scans of up to n items.',
        'hi-Latn': 'n baar scan, har baar n tak items.',
      },
    },
    watch: {
      en: 'Only one swap per pass: the work is in the comparisons.',
      'hi-Latn': 'Har pass me sirf ek swap: asli kaam comparisons me hai.',
    },
  },
  'insertion-sort': {
    name: { en: 'Insertion sort', 'hi-Latn': 'Insertion sort' },
    idea: {
      en: 'Take the next item and slide it left into its place among the already sorted items.',
      'hi-Latn':
        'Agla item lo aur use left me khiska kar pehle se sorted items ke beech uski jagah par rakho.',
    },
    best: {
      growth: 'O(n)',
      why: {
        en: 'Already sorted: each item stays where it is after one comparison.',
        'hi-Latn': 'Pehle se sorted: har item ek comparison ke baad wahin rehta hai.',
      },
    },
    worst: {
      growth: 'O(n²)',
      why: {
        en: 'Reversed: every item slides all the way to the front.',
        'hi-Latn': 'Ulti list: har item khisak kar bilkul aage tak jaata hai.',
      },
    },
    watch: {
      en: 'Compare the sorted and reversed runs below: same code, very different work.',
      'hi-Latn': 'Neeche sorted aur reversed run compare karo: code same, kaam bahut alag.',
    },
  },
  'find-extreme': {
    name: { en: 'Find the largest / smallest', 'hi-Latn': 'Sabse bada / chhota dhoondhna' },
    idea: {
      en: 'Keep the best so far and replace it whenever a better item turns up.',
      'hi-Latn': 'Ab tak ka best yaad rakho aur jab bhi usse behtar item mile, use badal do.',
    },
    best: {
      growth: 'O(n)',
      why: {
        en: 'Every item must be seen once: any one of them could be the answer.',
        'hi-Latn': 'Har item ek baar dekhna hi padega: koi bhi jawab ho sakta hai.',
      },
    },
    worst: {
      growth: 'O(n)',
      why: {
        en: 'Still one look per item; only the number of replacements changes.',
        'hi-Latn': 'Phir bhi har item ek baar; sirf badalne ki ginti badalti hai.',
      },
    },
    watch: {
      en: 'Watch when the condition is True: that is a new record.',
      'hi-Latn': 'Dekho condition kab True hoti hai: wahi naya record hai.',
    },
  },
  accumulate: {
    name: { en: 'Adding up / counting', 'hi-Latn': 'Jodna / ginna' },
    idea: {
      en: 'Start a total at 0 and add to it for every item.',
      'hi-Latn': 'Total 0 se shuru karo aur har item par usme jodo.',
    },
    best: {
      growth: 'O(n)',
      why: { en: 'One addition per item.', 'hi-Latn': 'Har item par ek jod.' },
    },
    worst: {
      growth: 'O(n)',
      why: { en: 'One addition per item.', 'hi-Latn': 'Har item par ek jod.' },
    },
    watch: {
      en: 'Watch the total box change on every round.',
      'hi-Latn': 'Har round me total wala box badalte dekho.',
    },
  },
  'nested-loops': {
    name: { en: 'Every pair (a loop inside a loop)', 'hi-Latn': 'Har jodi (loop ke andar loop)' },
    idea: {
      en: 'For each item, go through the items again.',
      'hi-Latn': 'Har item ke liye items ko phir se ek baar dekho.',
    },
    best: {
      growth: 'O(n²)',
      why: { en: 'n items times n items.', 'hi-Latn': 'n items guna n items.' },
    },
    worst: {
      growth: 'O(n²)',
      why: { en: 'n items times n items.', 'hi-Latn': 'n items guna n items.' },
    },
    watch: {
      en: 'Double the list and the work goes up four times.',
      'hi-Latn': 'List double karo to kaam chaar guna ho jaata hai.',
    },
  },
  recursion: {
    name: { en: 'Recursion', 'hi-Latn': 'Recursion' },
    idea: {
      en: 'The function calls itself on a smaller problem until it reaches a simple base case.',
      'hi-Latn':
        'Function chhote problem par khud ko call karta hai, jab tak simple base case na aa jaye.',
    },
    best: {
      growth: 'O(n)',
      why: {
        en: 'One call per step down to the base case.',
        'hi-Latn': 'Base case tak har step par ek call.',
      },
    },
    worst: {
      growth: 'O(n)',
      why: {
        en: 'One call per step down to the base case.',
        'hi-Latn': 'Base case tak har step par ek call.',
      },
    },
    watch: {
      en: 'Watch the function calls pile up, then come back one by one.',
      'hi-Latn': 'Function calls ko upar jamte aur phir ek-ek karke wapas aate dekho.',
    },
  },
  'branching-recursion': {
    name: { en: 'Branching recursion', 'hi-Latn': 'Branching recursion' },
    idea: {
      en: 'Each call makes two (or more) smaller calls, like fib(n - 1) + fib(n - 2).',
      'hi-Latn': 'Har call do (ya zyada) chhoti calls banata hai, jaise fib(n - 1) + fib(n - 2).',
    },
    best: {
      growth: 'O(2ⁿ)',
      why: {
        en: 'The same small problems are solved again and again.',
        'hi-Latn': 'Wahi chhote problems baar-baar solve hote hain.',
      },
    },
    worst: {
      growth: 'O(2ⁿ)',
      why: {
        en: 'The number of calls roughly doubles each time n grows by one. Remembering answers (memoisation) makes it O(n).',
        'hi-Latn':
          'n ek badhne par calls lagbhag double ho jaati hain. Jawab yaad rakhne (memoization) se yeh O(n) ho jaata hai.',
      },
    },
    watch: {
      en: 'Count how often the same call (say fib(2)) appears.',
      'hi-Latn': 'Gino ki ek hi call (jaise fib(2)) kitni baar aati hai.',
    },
  },
  'divide-and-conquer': {
    name: { en: 'Divide and conquer', 'hi-Latn': 'Divide and conquer' },
    idea: {
      en: 'Split the list in halves, solve each half, then combine (merge sort works like this).',
      'hi-Latn':
        'List ko aadhe-aadhe me todo, har aadha solve karo, phir jodo (merge sort aise hi chalta hai).',
    },
    best: {
      growth: 'O(n log n)',
      why: {
        en: 'log n levels of halving, n work on each level.',
        'hi-Latn': 'Aadha karne ke log n level, har level par n kaam.',
      },
    },
    worst: {
      growth: 'O(n log n)',
      why: {
        en: 'The halving does not depend on the order of the items.',
        'hi-Latn': 'Aadha karna items ke order par depend nahi karta.',
      },
    },
    watch: {
      en: 'Watch the calls split, then the results come back merged.',
      'hi-Latn': 'Calls ko bantte dekho, phir jude hue results wapas aate dekho.',
    },
  },
};

export const ALGORITHMS: Record<string, AlgorithmNotes> = { ...BASICS, ...MORE_ALGORITHMS };
