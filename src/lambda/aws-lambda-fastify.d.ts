declare module 'aws-lambda-fastify' {
  import type { FastifyInstance } from 'fastify';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function awsLambdaFastify(app: FastifyInstance, options?: Record<string, unknown>): (...args: any[]) => any;
  export = awsLambdaFastify;
}
