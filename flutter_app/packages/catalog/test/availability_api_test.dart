import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:test/test.dart';

void main() {
  group('availability validators (mirror server rules for instant feedback)', () {
    test('accepts a valid daytime interval', () {
      expect(
        areIntervalsValid([
          const WeeklySlot(dayOfWeek: 1, startTime: '09:00', endTime: '12:00'),
        ]),
        isTrue,
      );
    });

    test('rejects end before start', () {
      expect(
        areIntervalsValid([
          const WeeklySlot(dayOfWeek: 2, startTime: '14:00', endTime: '12:00'),
        ]),
        isFalse,
      );
    });

    test('rejects overlapping intervals on the same day', () {
      expect(
        areIntervalsValid([
          const WeeklySlot(dayOfWeek: 3, startTime: '09:00', endTime: '12:00'),
          const WeeklySlot(dayOfWeek: 3, startTime: '11:30', endTime: '14:00'),
        ]),
        isFalse,
      );
    });

    test('accepts adjacent intervals', () {
      expect(
        areIntervalsValid([
          const WeeklySlot(dayOfWeek: 3, startTime: '09:00', endTime: '12:00'),
          const WeeklySlot(dayOfWeek: 3, startTime: '12:00', endTime: '14:00'),
        ]),
        isTrue,
      );
    });

    test('rejects a fourth interval in one day', () {
      expect(
        areIntervalsValid([
          const WeeklySlot(dayOfWeek: 4, startTime: '09:00', endTime: '10:00'),
          const WeeklySlot(dayOfWeek: 4, startTime: '11:00', endTime: '12:00'),
          const WeeklySlot(dayOfWeek: 4, startTime: '13:00', endTime: '14:00'),
          const WeeklySlot(dayOfWeek: 4, startTime: '15:00', endTime: '16:00'),
        ]),
        isFalse,
      );
    });

    test('rejects overnight and out-of-daytime intervals', () {
      expect(
        areIntervalsValid([
          const WeeklySlot(dayOfWeek: 5, startTime: '21:00', endTime: '20:00'),
        ]),
        isFalse,
      );
      expect(isWithinDaytime('08:00', '10:00'), isFalse);
      expect(isWithinDaytime('21:00', '23:00'), isFalse);
      expect(isWithinDaytime('09:00', '22:00'), isTrue);
    });
  });

  group('availability DTOs', () {
    test('weekly slot serializes ISO day numbering', () {
      const slot = WeeklySlot(
        dayOfWeek: 7,
        startTime: '10:00',
        endTime: '12:00',
      );
      expect(slot.toJson(), {
        'dayOfWeek': 7,
        'startTime': '10:00',
        'endTime': '12:00',
      });
      expect(
        WeeklySlot.fromJson({
          'dayOfWeek': 7,
          'startTime': '10:00',
          'endTime': '12:00',
        }).dayOfWeek,
        7,
      );
    });

    test('full-day exception has null times', () {
      final item = AvailabilityExceptionItem.fromJson({
        'id': 'e1',
        'date': '2026-10-20',
        'type': 'unavailable',
        'startTime': null,
        'endTime': null,
        'reason': null,
      });
      expect(item.isFullDay, isTrue);
      expect(item.isUnavailable, isTrue);
    });

    test('slot day keeps instants as strings', () {
      final day = SlotDay.fromJson({
        'date': '2026-10-20',
        'slots': [
          {
            'startsAt': '2026-10-20T07:00:00.000Z',
            'endsAt': '2026-10-20T08:00:00.000Z',
          },
        ],
      });
      expect(day.slots, hasLength(1));
      expect(day.slots.first.startsAt, contains('2026-10-20'));
    });
  });
}
