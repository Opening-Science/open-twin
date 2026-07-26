import 'reflect-metadata';
import * as matchers from 'jest-extended';
import { expect } from 'vitest';

process.env.NODE_ENV = 'development';

expect.extend(matchers);
