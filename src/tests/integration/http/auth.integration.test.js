import { describe, expect, it } from 'vitest';
import request from 'supertest';

import { createTestApp } from '../testApp.js';
import { testSql } from '../testDb.js';

const app = createTestApp();

const REGISTRATION = {
  username: 'raytester',
  email: 'ray@example.test',
  password: 'Hunter2pass',
};

const PASSWORD_WITHOUT_A_DIGIT = 'nodigitsHere';

const LOGIN_PAGE = '/login.html';

const cookieNamed = (setCookie, name) =>
  setCookie.find((cookie) => cookie.startsWith(`${name}=`));

const isCleared = (setCookie, name) =>
  cookieNamed(setCookie, name).startsWith(`${name}=;`);

describe('POST /auth/register', () => {
  it('sets an http-only token cookie and a readable signed_in cookie', async () => {
    const response = await request(app)
      .post('/auth/register')
      .send(REGISTRATION)
      .expect(201);

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
    await request(app).post('/auth/register').send(REGISTRATION).expect(201);

    const response = await request(app)
      .post('/auth/register')
      .send({ ...REGISTRATION, email: 'someone-else@example.test' })
      .expect(409);

    expect(response.body).toBe('Account with this username already exists');
  });

  it('reports which password rule a rejected password broke', async () => {
    const response = await request(app)
      .post('/auth/register')
      .send({ ...REGISTRATION, password: PASSWORD_WITHOUT_A_DIGIT })
      .expect(400);

    expect(response.body).toEqual({
      status: 'fail',
      message: 'Validation failed',
      errors: {
        password: ['Password must contain a number'],
      },
    });

    const [persisted] = await testSql`
      SELECT username FROM users WHERE username = ${REGISTRATION.username}`;

    expect(persisted).toBeUndefined();
  });
});

describe('POST /auth/login', () => {
  it('rejects a password that does not match the stored hash', async () => {
    await request(app).post('/auth/register').send(REGISTRATION).expect(201);

    const response = await request(app)
      .post('/auth/login')
      .send({ username: REGISTRATION.username, password: 'Wrongpass1' })
      .expect(401);

    expect(response.body).toBe('Invalid username and/or password');
  });

  it('sets both cookies when the password matches the stored hash', async () => {
    await request(app).post('/auth/register').send(REGISTRATION).expect(201);

    const response = await request(app)
      .post('/auth/login')
      .send({
        username: REGISTRATION.username,
        password: REGISTRATION.password,
      })
      .expect(200);

    expect(response.body).toEqual({ message: 'Logged in' });

    const setCookie = response.headers['set-cookie'];

    expect(cookieNamed(setCookie, 'token')).toContain('HttpOnly');
    expect(cookieNamed(setCookie, 'signed_in')).not.toContain('HttpOnly');
  });
});

describe('POST /auth/logout', () => {
  it('clears both cookies and redirects to the login page', async () => {
    const response = await request(app)
      .post('/auth/logout')
      .expect(302)
      .expect('Location', LOGIN_PAGE);

    const setCookie = response.headers['set-cookie'];

    expect(isCleared(setCookie, 'token')).toBe(true);
    expect(isCleared(setCookie, 'signed_in')).toBe(true);
  });

  it('ends the session it was holding', async () => {
    const agent = request.agent(app);

    await agent.post('/auth/register').send(REGISTRATION).expect(201);

    await agent.get('/data').set('Accept', 'application/json').expect(200);

    await agent.post('/auth/logout').expect(302);

    const response = await agent
      .get('/data')
      .set('Accept', 'application/json')
      .expect(401);

    expect(response.body).toBe('Not logged in');
  });
});
