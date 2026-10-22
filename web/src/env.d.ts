// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- only an interface merges into Vite's ImportMetaEnv
interface ImportMetaEnv {
  /** ISO timestamp of the build (dev: server start), shown in the footer. Set in vite.config.ts. */
  readonly BUILD_TIME: string;
}
