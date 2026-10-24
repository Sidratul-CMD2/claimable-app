import { afterEach, describe, expect, test } from "bun:test";
import { connectionSettings, databaseUrl, DEFAULT_DATABASE_URL } from "@/server/db/connection";

const saved = { url: process.env.DATABASE_URL, env: process.env.NODE_ENV };
afterEach(() => {
  process.env.DATABASE_URL = saved.url;
  (process.env as Record<string, string | undefined>).NODE_ENV = saved.env;
});

describe("databaseUrl", () => {
  test("production without DATABASE_URL fails clearly instead of using localhost", () => {
    delete process.env.DATABASE_URL;
    (process.env as Record<string, string>).NODE_ENV = "production";
    expect(() => databaseUrl()).toThrow(/DATABASE_URL is not set/);
  });

  test("development falls back to the embedded database", () => {
    delete process.env.DATABASE_URL;
    (process.env as Record<string, string>).NODE_ENV = "development";
    expect(databaseUrl()).toBe(DEFAULT_DATABASE_URL);
  });

  test("an explicit DATABASE_URL always wins", () => {
    process.env.DATABASE_URL = " postgres://u:p@db.example.com/app ";
    (process.env as Record<string, string>).NODE_ENV = "production";
    expect(databaseUrl()).toBe("postgres://u:p@db.example.com/app");
  });
});

describe("connectionSettings", () => {
  test("Neon pooled URL: client-only options removed, sslmode kept, prepared statements off", () => {
    const s = connectionSettings("postgresql://user:p%40ss@ep-cool-name-123456-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require");
    expect(s.url).toBe("postgresql://user:p%40ss@ep-cool-name-123456-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require");
    expect(s.ssl).toBeNull(); // postgres.js applies sslmode=require from the URL
    expect(s.pooled).toBe(true);
  });

  test("hosted URL without sslmode gets TLS required; direct host keeps prepared statements", () => {
    const s = connectionSettings("postgres://user:pw@ep-cool-name-123456.us-east-1.aws.neon.tech/neondb");
    expect(s.ssl).toBe("require");
    expect(s.pooled).toBe(false);
  });

  test("sslrootcert=system means full certificate verification", () => {
    expect(connectionSettings("postgres://u:p@db.example.com/app?sslmode=verify-full&sslrootcert=system").ssl).toBe("verify-full");
  });

  test("local database: no TLS", () => {
    const s = connectionSettings(DEFAULT_DATABASE_URL);
    expect(s.ssl).toBeNull();
    expect(s.url).toBe(DEFAULT_DATABASE_URL);
  });
});
