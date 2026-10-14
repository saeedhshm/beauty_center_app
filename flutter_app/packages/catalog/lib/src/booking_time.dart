import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

bool _initialized = false;

/// Loads the IANA database once so wall times stay correct across DST.
/// Called centrally at app startup; every formatter below also ensures it
/// lazily, so no entry path can crash with `LocationNotFoundException`.
void ensureBookingTime() {
  if (_initialized) return;
  tzdata.initializeTimeZones();
  _initialized = true;
}

/// Deprecated: use [ensureBookingTime].
void ensureCairoTime() => ensureBookingTime();

tz.Location _location(String timeZone) {
  ensureBookingTime();
  try {
    return tz.getLocation(timeZone);
  } on Object {
    // Never crash on an unknown historical snapshot; UTC keeps the instant
    // exact while the date stays readable.
    return tz.UTC;
  }
}

const _arabicWeekdays = [
  'الإثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
  'الأحد',
];

const _arabicMonths = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

tz.TZDateTime _inZone(String instant, String timeZone) =>
    tz.TZDateTime.from(DateTime.parse(instant).toUtc(), _location(timeZone));

String _twoDigits(int value) => value.toString().padLeft(2, '0');

/// Readable Arabic date + time of an instant in the booking's own snapshot
/// zone. Never reinterprets a historical booking in the current market zone
/// and never touches the device timezone.
String formatBookingDateTime(String instant, String timeZone) {
  final local = _inZone(instant, timeZone);
  return '${_arabicWeekdays[local.weekday - 1]}، ${local.day} '
      '${_arabicMonths[local.month - 1]} ${local.year}، '
      '${_twoDigits(local.hour)}:${_twoDigits(local.minute)}';
}

/// Readable Arabic date of an instant in the booking's own snapshot zone.
String formatBookingDate(String instant, String timeZone) {
  final local = _inZone(instant, timeZone);
  return '${local.day} ${_arabicMonths[local.month - 1]} ${local.year}';
}

/// Wall-clock `HH:MM` of an instant in the booking's own snapshot zone.
String formatBookingTime(String instant, String timeZone) {
  final local = _inZone(instant, timeZone);
  return '${_twoDigits(local.hour)}:${_twoDigits(local.minute)}';
}

/// Cairo local date (`YYYY-MM-DD`) of [instant].
///
/// Only for current slot data whose contract fixes `Africa/Cairo`.
String cairoDateOf(DateTime instant) {
  final local = tz.TZDateTime.from(instant.toUtc(), _location('Africa/Cairo'));
  return '${local.year.toString().padLeft(4, '0')}-'
      '${local.month.toString().padLeft(2, '0')}-'
      '${local.day.toString().padLeft(2, '0')}';
}

/// Cairo wall-clock `HH:MM` of [instant] for slot display.
///
/// Only for current slot data whose contract fixes `Africa/Cairo`.
String cairoClockOf(String instant) {
  final local = tz.TZDateTime.from(
    DateTime.parse(instant).toUtc(),
    _location('Africa/Cairo'),
  );
  return '${_twoDigits(local.hour)}:${_twoDigits(local.minute)}';
}

/// ISO weekday (Monday=1, Sunday=7) of a Cairo local `YYYY-MM-DD` date.
int cairoWeekdayOf(String date) {
  final parts = date.split('-');
  final noon = tz.TZDateTime(
    _location('Africa/Cairo'),
    int.parse(parts[0]),
    int.parse(parts[1]),
    int.parse(parts[2]),
    12,
  );
  return noon.weekday;
}

/// Short `day/month` label of a Cairo local `YYYY-MM-DD` date.
String cairoDayLabel(String date) {
  final parts = date.split('-');
  return '${int.parse(parts[2])}/${int.parse(parts[1])}';
}

/// Cairo local dates of the next [days] days, starting today.
List<String> nextCairoDates({required DateTime now, int days = 14}) {
  final today = tz.TZDateTime.from(now.toUtc(), _location('Africa/Cairo'));
  final base = DateTime.utc(today.year, today.month, today.day);
  return List<String>.generate(days, (index) {
    final date = base.add(Duration(days: index));
    return '${date.year.toString().padLeft(4, '0')}-'
        '${date.month.toString().padLeft(2, '0')}-'
        '${date.day.toString().padLeft(2, '0')}';
  });
}
