// Single list of services and ports, shared by the native stack runner, docker compose
// generation and the gateway's default routes.

export const INFRA = {
  postgres: { port: 55432 },
  nats: { port: 4222, monitor: 8222 },
  redis: { port: 56379 },
  mailpit: { smtp: 1025, http: 8025 },
};

export const GATEWAY_PORT = 8080;

/** name → port. Each service has its own database named after it. */
export const SERVICES = {
  identity: 4101,
  profile: 4102,
  consent: 4103,
  content: 4104,
  authoring: 4105,
  practice: 4106,
  progress: 4107,
  review: 4108,
  gamification: 4109,
  notification: 4110,
  analytics: 4111,
  audit: 4112,
};

export const serviceUrl = (name, host = '127.0.0.1') => `http://${host}:${SERVICES[name]}`;
