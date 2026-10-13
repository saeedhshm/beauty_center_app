import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

bool _initialized = false;

/// Loads the IANA database once so Cairo wall times stay correct across DST.
void ensureCairoTime() {
  if (_initialized) return;
  tzdata.initializeTimeZones();
  _initialized = true;
}

tz.Location get _cairo => tz.getLocation('Africa/Cairo');

/// Cairo local date (`YYYY-MM-DD`) of [instant].
String cairoDateOf(DateTime instant) {
  final local = tz.TZDateTime.from(instant.toUtc(), _cairo);
  return '${local.year.toString().padLeft(4, '0')}-'
      '${local.month.toString().padLeft(2, '0')}-'
      '${local.day.toString().padLeft(2, '0')}';
}

/// Cairo wall-clock `HH:MM` of [instant] for slot display.
String cairoClockOf(String instant) {
  final local = tz.TZDateTime.from(DateTime.parse(instant).toUtc(), _cairo);
  return '${local.hour.toString().padLeft(2, '0')}:'
      '${local.minute.toString().padLeft(2, '0')}';
}

/// ISO weekday (Monday=1, Sunday=7) of a Cairo local `YYYY-MM-DD` date.
int cairoWeekdayOf(String date) {
  final parts = date.split('-');
  final noon = tz.TZDateTime(
    _cairo,
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
  final today = tz.TZDateTime.from(now.toUtc(), _cairo);
  final base = DateTime.utc(today.year, today.month, today.day);
  return List<String>.generate(days, (index) {
    final date = base.add(Duration(days: index));
    return '${date.year.toString().padLeft(4, '0')}-'
        '${date.month.toString().padLeft(2, '0')}-'
        '${date.day.toString().padLeft(2, '0')}';
  });
}
