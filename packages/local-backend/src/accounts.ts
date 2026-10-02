/** One-tap demo accounts (shown on the demo sign-in screen). Kept tiny so screens can import it. */
export const DEMO_ACCOUNTS = [
  { role: 'student', email: 'student@demo.logicpath.dev', name: 'Asha Verma' },
  { role: 'writer', email: 'writer@demo.logicpath.dev', name: 'Wasim Khan' },
  { role: 'admin', email: 'admin@demo.logicpath.dev', name: 'Anita Rao' },
] as const;
export const DEMO_PASSWORD = 'demo-password';

/** A class that exists in every demo, so "join a class" can be tried straight away. */
export const DEMO_CLASS_CODE = 'DEMO42';
