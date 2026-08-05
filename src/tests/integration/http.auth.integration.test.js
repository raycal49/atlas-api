import {
  describe,
  expect,
  it,
} from 'vitest';
import request from 'supertest';

import { createTestApp } from './testApp.js';
import { testSql } from './testDb.js';

const app = createTestApp();

const REGISTRATION = {
  username: 'raytester',
  email: 'ray@example.test',
  password: 'Hunter2pass',
};

const cookieNamed = (setCookie, name) =>
  setCookie.find((cookie) => cookie.startsWith(`${name}=`));

describe('POST /auth/register', () => {
  it('sets an http-only token cookie and a readable signed_in cookie', async () => {
    const response = await request(app)
      .post('/auth/register')
      .send(REGISTRATION);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      message: 'raytester, your account was successfully created!',
    });

    const setCookie = response.headers['set-cookie'];

    expect(cookieNamed(setCookie, 'token')).toContain('HttpOnly');
    expect(cookieNamed(setCookie, 'signed_in')).not.toContain('HttpOnly');

    const [persisted] = await testSql`
      SELECT username, email
      FROM users
      WHERE username = ${REGISTRATION.username}`;

    expect(persisted).toEqual({
      username: 'raytester',
      email: 'ray@example.test',
    });
  });

  it('rejects a username that is already taken', async () => {
    await request(app)
      .post('/auth/register')
      .send(REGISTRATION);

    const response = await request(app)
      .post('/auth/register')
      .send({ ...REGISTRATION, email: 'someone-else@example.test' });

    expect(response.status).toBe(409);
    expect(response.body).toBe('Account with this username already exists');
  });
});

describe('POST /auth/login', () => {
  it('rejects a password that does not match the stored hash', async () => {
    await request(app)
      .post('/auth/register')
      .send(REGISTRATION);

    const response = await request(app)
      .post('/auth/login')
      .send({ username: REGISTRATION.username, password: 'Wrongpass1' });

    expect(response.status).toBe(401);
    expect(response.body).toBe('Invalid username and/or password');
  });
});
