import type { AlgorithmNotes } from './algorithms';

const same = (en: string, hi: string) => ({ en, 'hi-Latn': hi });

/** The patterns beyond the basic searches and sorts (detect.ts). */
export const MORE_ALGORITHMS: Record<string, AlgorithmNotes> = {
  'two-pointers': {
    name: same('Two pointers', 'Two pointers'),
    idea: same(
      'One marker starts at each end and they walk towards each other.',
      'Ek marker shuru se aur ek end se chalta hai, dono ek-doosre ki taraf badhte hain.',
    ),
    best: {
      growth: 'O(1)',
      why: same(
        'The answer shows at the first pair (say the ends differ).',
        'Pehli jodi par hi jawab mil jaata hai (jaise dono end alag hon).',
      ),
    },
    worst: {
      growth: 'O(n)',
      why: same(
        'The markers meet in the middle: every item is looked at once.',
        'Markers beech me milte hain: har item ek baar dekha jaata hai.',
      ),
    },
    watch: same(
      'Watch left and right close in: one round, one step each.',
      'left aur right ko paas aate dekho: har round me ek-ek kadam.',
    ),
  },
  'sliding-window': {
    name: same('Sliding window', 'Sliding window'),
    idea: same(
      'Keep a running total of a window; slide it by adding the new item and removing the old one.',
      'Ek window ka running total rakho; naya item jodo aur purana hatao, window aage khisak jaati hai.',
    ),
    best: {
      growth: 'O(n)',
      why: same(
        'Each item enters and leaves once.',
        'Har item ek baar aata aur ek baar jaata hai.',
      ),
    },
    worst: {
      growth: 'O(n)',
      why: same(
        'Adding up every window from scratch would be O(n·k); sliding avoids it.',
        'Har window ko naye sire se jodna O(n·k) hota; khiskane se woh bach jaata hai.',
      ),
    },
    watch: same(
      'Watch the window total change by one item in, one item out.',
      'Window total ko ek item andar, ek bahar se badalte dekho.',
    ),
  },
  'prefix-sum': {
    name: same('Prefix sums', 'Prefix sum'),
    idea: same(
      'Store the running total at every position, so any range sum is one subtraction later.',
      'Har position par ab tak ka total rakho, taaki baad me kisi bhi range ka sum ek minus se mil jaye.',
    ),
    best: { growth: 'O(n)', why: same('One pass to build.', 'Banane me ek pass.') },
    worst: {
      growth: 'O(n)',
      why: same(
        'One pass to build; each range query is then O(1).',
        'Banane me ek pass; phir har range query O(1).',
      ),
    },
    watch: same(
      'Each cell is the one before it plus one item.',
      'Har cell pichhle cell plus ek item hai.',
    ),
  },
  hashing: {
    name: same('Counting with a dictionary (hashing)', 'Dictionary se ginna (hashing)'),
    idea: same(
      'A dictionary finds a key in about one step, so counting or looking up is fast.',
      'Dictionary ek key ko lagbhag ek step me dhoondh leti hai, isliye ginna ya dhoondhna tez hota hai.',
    ),
    best: { growth: 'O(n)', why: same('One step per item.', 'Har item par ek step.') },
    worst: {
      growth: 'O(n)',
      why: same(
        'One step per item on average. A list instead of a dictionary would make each lookup O(n).',
        'Aam taur par har item par ek step. Dictionary ki jagah list ho to har lookup O(n) ho jaata.',
      ),
    },
    watch: same(
      'Watch the dictionary box grow and its counts go up.',
      'Dictionary box ko badhte aur counts ko upar jaate dekho.',
    ),
  },
  stack: {
    name: same('Stack', 'Stack'),
    idea: same(
      'Push with append, take the last one back with pop: last in, first out.',
      'append se upar rakho, pop se aakhri wala wapas lo: jo last aaya woh pehle jaata hai.',
    ),
    best: {
      growth: 'O(1)',
      why: same(
        'A mismatch right at the start ends it at once.',
        'Shuru me hi mismatch ho to turant khatam.',
      ),
    },
    worst: {
      growth: 'O(n)',
      why: same(
        'Each item is pushed and popped at most once.',
        'Har item zyada se zyada ek baar push aur ek baar pop hota hai.',
      ),
    },
    watch: same(
      'Watch the list grow at the end and shrink from the end.',
      'List ko end par badhte aur end se ghatte dekho.',
    ),
  },
  bfs: {
    name: same('Breadth-first search (BFS)', 'Breadth-first search (BFS)'),
    idea: same(
      'Visit the start, then all its neighbours, then theirs: level by level, using a queue.',
      'Pehle start, phir uske saare padosi, phir unke: level-by-level, queue ke saath.',
    ),
    best: {
      growth: 'O(V + E)',
      why: same(
        'Every node (V) and every edge (E) once.',
        'Har node (V) aur har edge (E) ek baar.',
      ),
    },
    worst: {
      growth: 'O(V + E)',
      why: same(
        'The seen set stops any node being queued twice.',
        'seen set kisi node ko do baar queue me jaane nahi deta.',
      ),
    },
    watch: same(
      'Watch the queue: in at the back, out at the front.',
      'Queue dekho: peeche se andar, aage se bahar.',
    ),
  },
  dfs: {
    name: same('Depth-first search (DFS)', 'Depth-first search (DFS)'),
    idea: same(
      'Go as deep as possible along one path, then come back and try the next.',
      'Ek raaste par jitna gehra ho sake jao, phir wapas aa kar agla raasta try karo.',
    ),
    best: {
      growth: 'O(V + E)',
      why: same('Every node and edge once.', 'Har node aur edge ek baar.'),
    },
    worst: {
      growth: 'O(V + E)',
      why: same(
        'visited stops any node being entered twice.',
        'visited kisi node me do baar jaane nahi deta.',
      ),
    },
    watch: same(
      'Watch the calls pile up as it goes deeper.',
      'Gehra jaate hue calls ko upar jamte dekho.',
    ),
  },
  'merge-sort': {
    name: same('Merge sort', 'Merge sort'),
    idea: same(
      'Split the list in half, sort each half, then merge the two sorted halves.',
      'List ko aadha karo, dono aadhe sort karo, phir dono sorted aadhon ko jodo (merge).',
    ),
    best: {
      growth: 'O(n log n)',
      why: same('It always splits all the way down.', 'Yeh hamesha poora neeche tak todta hai.'),
    },
    worst: {
      growth: 'O(n log n)',
      why: same(
        'log n levels of halving, n work to merge each level.',
        'log n level, har level par merge me n kaam.',
      ),
    },
    watch: same(
      'Watch the calls split, then merge back up.',
      'Calls ko bantte, phir merge ho kar upar aate dekho.',
    ),
  },
  'quick-sort': {
    name: same('Quick sort', 'Quick sort'),
    idea: same(
      'Pick a pivot, put smaller items left and bigger right, then sort each side.',
      'Ek pivot chuno, chhote items left aur bade right, phir dono taraf sort karo.',
    ),
    best: {
      growth: 'O(n log n)',
      why: same(
        'A pivot near the middle halves the list each time.',
        'Beech ke paas ka pivot har baar list aadhi karta hai.',
      ),
    },
    worst: {
      growth: 'O(n²)',
      why: same(
        'With the first item as pivot, an already sorted list splits off one item at a time.',
        'Pehla item pivot ho aur list pehle se sorted ho, to har baar sirf ek item alag hota hai.',
      ),
    },
    watch: same(
      'Compare the sorted and shuffled runs below.',
      'Neeche sorted aur shuffled runs compare karo.',
    ),
  },
  kadane: {
    name: same("Kadane's maximum subarray", 'Kadane (maximum subarray)'),
    idea: same(
      'Carry the best sum ending here; restart when carrying on would only make it smaller.',
      'Yahan tak khatam hone wala best sum saath le chalo; agar aage le jaane se chhota ho to naye sire se shuru karo.',
    ),
    best: { growth: 'O(n)', why: same('One pass over the list.', 'List par ek pass.') },
    worst: {
      growth: 'O(n)',
      why: same(
        'Trying every subarray would be O(n²); one pass is enough.',
        'Har subarray try karna O(n²) hota; ek pass kaafi hai.',
      ),
    },
    watch: same(
      'Watch cur restart and best keep the record.',
      'cur ko restart hote aur best ko record rakhte dekho.',
    ),
  },
  'dynamic-programming': {
    name: same('Dynamic programming', 'Dynamic programming'),
    idea: same(
      'Build the answer for n from answers already stored for smaller values.',
      'n ka jawab chhoti values ke pehle se rakhe hue jawabon se banao.',
    ),
    best: {
      growth: 'O(n)',
      why: same('One cell per value of n.', 'n ki har value ke liye ek cell.'),
    },
    worst: {
      growth: 'O(n)',
      why: same(
        'Each cell is filled once from a few earlier cells (a table with two dimensions would be O(n²)).',
        'Har cell kuch pichhle cells se ek baar bharta hai (do dimension wali table O(n²) hoti).',
      ),
    },
    watch: same('Watch the table fill left to right.', 'Table ko left se right bharte dekho.'),
  },
  memoization: {
    name: same('Recursion with memoization', 'Recursion + memoization'),
    idea: same(
      'Save each answer the first time; the next call for the same value just reads it.',
      'Har jawab pehli baar save karo; usi value ki agli call bas use padh leti hai.',
    ),
    best: {
      growth: 'O(n)',
      why: same('Each value is worked out once.', 'Har value ek hi baar nikalti hai.'),
    },
    worst: {
      growth: 'O(n)',
      why: same('Without the memo this would be O(2ⁿ).', 'Memo ke bina yeh O(2ⁿ) hota.'),
    },
    watch: same('Watch the memo dictionary fill up.', 'memo dictionary ko bharte dekho.'),
  },
  gcd: {
    name: same("Euclid's GCD", 'Euclid ka GCD'),
    idea: same(
      'Replace (a, b) with (b, a % b) until b is 0.',
      '(a, b) ko (b, a % b) se badlo jab tak b 0 na ho.',
    ),
    best: {
      growth: 'O(1)',
      why: same('b divides a: one step.', 'b, a ko poora divide karta hai: ek step.'),
    },
    worst: {
      growth: 'O(log n)',
      why: same(
        'The numbers shrink at least as fast as halving every two steps (worst for neighbouring Fibonacci numbers).',
        'Numbers har do step me kam se kam aadhe jitni tezi se chhote hote hain (worst: paas-paas ke Fibonacci numbers).',
      ),
    },
    watch: same('Watch a and b shrink.', 'a aur b ko chhota hote dekho.'),
  },
  sieve: {
    name: same('Sieve of Eratosthenes', 'Sieve of Eratosthenes'),
    idea: same(
      'Cross out the multiples of each prime; what is left is prime.',
      'Har prime ke multiples kaat do; jo bache woh prime hain.',
    ),
    best: {
      growth: 'O(n log log n)',
      why: same('n/2 + n/3 + n/5 + … crossings in all.', 'Kul n/2 + n/3 + n/5 + … baar kaatna.'),
    },
    worst: {
      growth: 'O(n log log n)',
      why: same(
        'log log n grows so slowly it is almost a straight line.',
        'log log n itna dheere badhta hai ki yeh lagbhag seedhi line hai.',
      ),
    },
    watch: same(
      'Watch whole groups of cells turn False at once.',
      'Cells ke poore group ko ek saath False hote dekho.',
    ),
  },
  'prime-check': {
    name: same('Prime check up to √n', 'Prime check (√n tak)'),
    idea: same(
      'Try divisors only up to √n: a bigger divisor would pair with a smaller one already tried.',
      'Sirf √n tak divisor try karo: bada divisor hota to uska chhota jodi pehle hi try ho chuka hota.',
    ),
    best: {
      growth: 'O(1)',
      why: same('An even number is caught at 2.', 'Even number 2 par hi pakda jaata hai.'),
    },
    worst: {
      growth: 'O(√n)',
      why: same(
        'A prime survives every divisor up to √n.',
        'Prime number √n tak har divisor se bach jaata hai.',
      ),
    },
    watch: same(
      'Compare the even and prime runs below.',
      'Neeche even aur prime runs compare karo.',
    ),
  },
  'fast-power': {
    name: same('Fast power (binary exponentiation)', 'Fast power (binary exponentiation)'),
    idea: same(
      'Square the base and halve the exponent; multiply in the base when the exponent is odd.',
      'Base ka square karo aur exponent aadha; exponent odd ho to base ko result me guna karo.',
    ),
    best: {
      growth: 'O(log n)',
      why: same('One round per bit of the exponent.', 'Exponent ke har bit ke liye ek round.'),
    },
    worst: {
      growth: 'O(log n)',
      why: same('Multiplying n times would be O(n).', 'n baar guna karna O(n) hota.'),
    },
    watch: same('Watch exp halve each round.', 'exp ko har round aadha hote dekho.'),
  },
  reverse: {
    name: same('Reverse / palindrome', 'Reverse / palindrome'),
    idea: same(
      's[::-1] makes a reversed copy; equal to s means a palindrome.',
      's[::-1] ulti copy banata hai; s ke barabar ho to palindrome.',
    ),
    best: {
      growth: 'O(n)',
      why: same('The copy touches every character.', 'Copy har character ko chhooti hai.'),
    },
    worst: {
      growth: 'O(n)',
      why: same('One copy, one comparison pass.', 'Ek copy, ek comparison pass.'),
    },
    watch: same(
      'Two pointers from both ends can stop at the first mismatch instead.',
      'Dono end se two pointers pehle mismatch par hi ruk sakte hain.',
    ),
  },
};
