import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasDaylightIrradiance } from '../src/city/timeOfDay.ts';

test('post-process solar irradiance is used only during daylight', () => {
  assert.equal(hasDaylightIrradiance('day'), true);
  assert.equal(hasDaylightIrradiance('dusk'), false);
  assert.equal(hasDaylightIrradiance('night'), false);
});
