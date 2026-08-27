import postgres from 'postgres';

const getDebugOption = () => {
  if (process.env.DATABASE_LOG_QUERIES !== 'true') {
    return false;
  }

  return (_connection, query, parameters, _parameterTypes) => {
    console.log('\n--- PostgreSQL query ---');
    console.log(query);
    console.log('Parameters:', parameters);
    console.log('------------------------\n');
  };
};

const getSslOption = () => {
  const sslMode = process.env.DATABASE_SSL_MODE;

  switch (sslMode) {
    case 'require':
      return 'require';

    case 'disable':
      return false;

    default:
      throw new Error(
        'DATABASE_SSL_MODE must be either "require" or "disable"',
      );
  }
};

export const createDatabase = (
  connectionString = process.env.DATABASE_URL,
) => {
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  return postgres(connectionString, {
    ssl: getSslOption(),
    debug: getDebugOption(),
  });
};