import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:test/test.dart';

void main() {
  test('Cairo booking renders an Arabic date and time', () {
    expect(
      formatBookingDateTime('2026-10-20T07:00:00.000Z', 'Africa/Cairo'),
      'الثلاثاء، 20 أكتوبر 2026، 10:00',
    );
    expect(
      formatBookingDate('2026-10-20T07:00:00.000Z', 'Africa/Cairo'),
      '20 أكتوبر 2026',
    );
    expect(
      formatBookingTime('2026-10-20T07:00:00.000Z', 'Africa/Cairo'),
      '10:00',
    );
  });

  test('historic Riyadh booking keeps its own snapshot zone', () {
    // Asia/Riyadh is UTC+3 year-round: the same instant reads differently
    // than in Cairo, and must not be reinterpreted in the market zone.
    expect(
      formatBookingDateTime('2026-01-15T10:00:00.000Z', 'Asia/Riyadh'),
      'الخميس، 15 يناير 2026، 13:00',
    );
    expect(
      formatBookingDateTime('2026-01-15T10:00:00.000Z', 'Africa/Cairo'),
      'الخميس، 15 يناير 2026، 12:00',
    );
  });

  test('Cairo DST is honored across seasons', () {
    // Winter (+2) vs summer (+3) offsets of the same wall instant.
    expect(
      formatBookingTime('2026-01-15T12:00:00.000Z', 'Africa/Cairo'),
      '14:00',
    );
    expect(
      formatBookingTime('2026-07-15T12:00:00.000Z', 'Africa/Cairo'),
      '15:00',
    );
  });

  test('unknown zone falls back to UTC without crashing', () {
    expect(
      formatBookingDateTime('2026-10-20T07:00:00.000Z', 'Mars/Olympus'),
      'الثلاثاء، 20 أكتوبر 2026، 07:00',
    );
  });

  test('slot helpers stay fixed to Africa/Cairo per contract', () {
    expect(cairoClockOf('2026-10-20T07:00:00.000Z'), '10:00');
    expect(cairoClockOf('2026-12-20T07:00:00.000Z'), '09:00');
    expect(cairoWeekdayOf('2026-10-20'), 2);
    expect(cairoDayLabel('2026-10-20'), '20/10');
  });

  test('parseLocalDate enforces a real calendar date', () {
    expect(parseLocalDate('2026-10-20')?.day, 20);
    expect(parseLocalDate('2026-99-99'), isNull);
    expect(parseLocalDate('2026-13-01'), isNull);
    expect(parseLocalDate('2026-02-30'), isNull);
    expect(parseLocalDate('2026-02-29'), isNull);
    expect(parseLocalDate('2024-02-29')?.day, 29);
    expect(parseLocalDate('20-10-2026'), isNull);
    expect(parseLocalDate('not-a-date'), isNull);
  });

  test('isValidClockTime enforces real 24-hour times', () {
    expect(isValidClockTime('09:00'), isTrue);
    expect(isValidClockTime('22:00'), isTrue);
    expect(isValidClockTime('00:00'), isTrue);
    expect(isValidClockTime('23:59'), isTrue);
    expect(isValidClockTime('24:00'), isFalse);
    expect(isValidClockTime('99:99'), isFalse);
    expect(isValidClockTime('9:00'), isFalse);
    expect(isValidClockTime('12:60'), isFalse);
    expect(clockToMinutes('09:30'), 570);
  });
}
