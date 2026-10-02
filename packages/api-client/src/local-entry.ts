/** The in-page backend transport (demo and guest mode); separate so http builds don't load it. */
export {
  fail,
  localTransport,
  type LocalBackend,
  type LocalContext,
  type LocalHandler,
  type LocalInput,
  type LocalOptions,
  type LocalUser,
} from './local';
