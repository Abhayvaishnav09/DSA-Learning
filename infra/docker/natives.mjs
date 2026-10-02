// Packages esbuild leaves out of service bundles (native code or optional), shared by the bundler
// and the image build, which installs only these into the runtime image.
export const NATIVE = ['@node-rs/argon2', 'pg-native', 'pino-pretty'];
