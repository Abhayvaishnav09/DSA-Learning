/** Words for the "visualize your code" screen. Both languages, next to the screen. */

const en = {
  title: 'Watch your code run',
  intro:
    'Paste or upload a program and step through it line by line: the boxes, the list cells being checked, the comparisons and the screen.',
  language: 'Language',
  python: 'Python',
  pseudocode: 'Pseudocode',
  example: 'Start from an example',
  examplePick: 'Pick an example…',
  code: 'Your program',
  upload: 'Upload a file',
  uploadHelp: '.py or .txt, up to 50 KB. It stays on your device.',
  tooBig: 'That file is bigger than 50 KB. Try a smaller program.',
  notText: 'That file is not plain text. Upload a .py or .txt file.',
  input: 'Input (for input())',
  inputHelp: 'One value per line, used in order.',
  run: 'Run and visualize',
  loading: 'Getting Python ready… (the first time downloads about 13 MB)',
  running: 'Running…',
  unavailable:
    'Python could not start. Check your internet connection and try again (it is needed only the first time).',
  pseudoError: (message: string) => `The program does not run: ${message}`,
  stoppedEarly:
    'The program stopped with an error. You can still step through everything up to it.',
  empty: 'Write or paste a program first.',
  limits: 'Up to 1,000 steps and 5 seconds per run. Only the first 40 items of a list are drawn.',
};

type Strings = typeof en;

const hi: Strings = {
  title: 'Apne code ko chalte hue dekho',
  intro:
    'Program paste ya upload karo aur ek-ek line aage badho: box, list ke kaun se cells check ho rahe hain, comparisons aur screen sab dikhega.',
  language: 'Language',
  python: 'Python',
  pseudocode: 'Pseudocode',
  example: 'Kisi example se shuru karo',
  examplePick: 'Example chuno…',
  code: 'Tumhara program',
  upload: 'File upload karo',
  uploadHelp: '.py ya .txt, 50 KB tak. File tumhare device par hi rehti hai.',
  tooBig: 'Yeh file 50 KB se badi hai. Chhota program try karo.',
  notText: 'Yeh plain text file nahi hai. .py ya .txt file upload karo.',
  input: 'Input (input() ke liye)',
  inputHelp: 'Har line me ek value, order me use hogi.',
  run: 'Chalao aur dekho',
  loading: 'Python taiyaar ho raha hai… (pehli baar lagbhag 13 MB download hota hai)',
  running: 'Chal raha hai…',
  unavailable:
    'Python shuru nahi ho paya. Internet check karke phir try karo (sirf pehli baar zaroori hai).',
  pseudoError: (message) => `Program nahi chala: ${message}`,
  stoppedEarly: 'Program error par ruk gaya. Error tak ka har step tum ab bhi dekh sakte ho.',
  empty: 'Pehle program likho ya paste karo.',
  limits: 'Har run me 1,000 steps aur 5 second tak. List ke pehle 40 items hi dikhte hain.',
};

export const visualizeStrings = { en, 'hi-Latn': hi };
