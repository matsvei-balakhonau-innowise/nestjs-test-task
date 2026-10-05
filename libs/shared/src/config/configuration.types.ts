export interface AppConfiguration {
  nodeEnv: string;
  mongodb: {
    uri: string;
    dbName: string;
  };
  redis: {
    host: string;
    port: number;
    url: string;
  };
  messaging: {
    host: string;
    port: number;
    eventsChannel: string;
  };
  serviceA: {
    host: string;
    port: number;
  };
  serviceB: {
    host: string;
    port: number;
  };
}
