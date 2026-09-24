import { describe, expect, it } from 'vitest';
import { isGroupNotFormedReason } from '../src/worker/services/group-departures';

describe('MAX TOUR group cancellation classification', () => {
  it.each([
    'Группа не набрана',
    'Группа не набралась',
    'Группа не собрана',
    'Группа не собралась',
    'Не набрали минимальное количество участников',
  ])('classifies %s as full-deposit group-not-formed case', (reason) => {
    expect(isGroupNotFormedReason(reason)).toBe(true);
  });

  it.each([
    'Отмена из-за погоды',
    'Техническая причина',
    'Перенос организатором',
  ])('does not classify %s as a group-not-formed case', (reason) => {
    expect(isGroupNotFormedReason(reason)).toBe(false);
  });
});
