import 'package:lamsa_networking/lamsa_networking.dart';

import 'models.dart';

/// Weekly working interval of an expert. [dayOfWeek] follows ISO numbering
/// (Monday=1, Sunday=7) and times are Cairo wall-clock `HH:MM` strings.
class WeeklySlot {
  const WeeklySlot({
    required this.dayOfWeek,
    required this.startTime,
    required this.endTime,
  });

  final int dayOfWeek;
  final String startTime;
  final String endTime;

  factory WeeklySlot.fromJson(JsonObject json) => WeeklySlot(
    dayOfWeek: (json['dayOfWeek'] as num).toInt(),
    startTime: json['startTime'] as String,
    endTime: json['endTime'] as String,
  );

  Map<String, Object?> toJson() => {
    'dayOfWeek': dayOfWeek,
    'startTime': startTime,
    'endTime': endTime,
  };
}

/// A schedule exception. Null times mean a full-day exception.
class AvailabilityExceptionItem {
  const AvailabilityExceptionItem({
    required this.id,
    required this.date,
    required this.type,
    this.startTime,
    this.endTime,
    this.reason,
  });

  final String id;
  final String date;
  final String type;
  final String? startTime;
  final String? endTime;
  final String? reason;

  bool get isFullDay => startTime == null || endTime == null;
  bool get isUnavailable => type == 'unavailable';

  factory AvailabilityExceptionItem.fromJson(JsonObject json) =>
      AvailabilityExceptionItem(
        id: json['id'] as String,
        date: json['date'] as String,
        type: json['type'] as String,
        startTime: json['startTime'] as String?,
        endTime: json['endTime'] as String?,
        reason: json['reason'] as String?,
      );
}

/// One bookable slot. Times are ISO-8601 instants in UTC.
class ExpertSlot {
  const ExpertSlot({required this.startsAt, required this.endsAt});

  final String startsAt;
  final String endsAt;

  factory ExpertSlot.fromJson(JsonObject json) => ExpertSlot(
    startsAt: json['startsAt'] as String,
    endsAt: json['endsAt'] as String,
  );
}

/// Slots of a single Cairo local date (`YYYY-MM-DD`).
class SlotDay {
  const SlotDay({required this.date, required this.slots});

  final String date;
  final List<ExpertSlot> slots;

  factory SlotDay.fromJson(JsonObject json) {
    final raw = json['slots'];
    final items = raw is List<Object?>
        ? raw
              .whereType<JsonObject>()
              .map(ExpertSlot.fromJson)
              .toList(growable: false)
        : const <ExpertSlot>[];
    return SlotDay(date: json['date'] as String, slots: items);
  }
}

int _minutesOf(String value) {
  final parts = value.split(':');
  return int.parse(parts[0]) * 60 + int.parse(parts[1]);
}

bool _isClockTime(String value) =>
    RegExp(r'^\d{2}:\d{2}$').hasMatch(value) &&
    _minutesOf(value) >= 0 &&
    _minutesOf(value) < 24 * 60;

/// Mirrors the server daytime rule (09:00–22:00 Cairo) for instant UI feedback.
/// The backend stays authoritative.
bool isWithinDaytime(String startTime, String endTime) {
  if (!_isClockTime(startTime) || !_isClockTime(endTime)) return false;
  return _minutesOf(startTime) >= 9 * 60 && _minutesOf(endTime) <= 22 * 60;
}

/// Why one day's intervals cannot be saved. These are exactly the rules the
/// server enforces (`weeklyScheduleSchema`): at most three intervals a day,
/// ordered, inside daytime, and non-overlapping. Nothing is added here.
enum ScheduleProblem {
  tooManyIntervals,
  malformedTime,
  endNotAfterStart,
  outsideDaytime,
  overlapping,
}

/// A validation outcome rather than a bare flag: it names the first problem
/// and the day it belongs to, so a screen can explain it and block saving.
class ScheduleValidation {
  const ScheduleValidation.valid() : problem = null, day = null;
  const ScheduleValidation.invalid(this.problem, this.day);

  final ScheduleProblem? problem;
  final int? day;

  bool get isValid => problem == null;
}

/// Validates the intervals of a single day against the contract rules.
ScheduleValidation validateDayIntervals(List<WeeklySlot> intervals) {
  const day = 0;
  if (intervals.length > 3) {
    return const ScheduleValidation.invalid(
      ScheduleProblem.tooManyIntervals,
      day,
    );
  }
  if (intervals.any(
    (slot) => !_isClockTime(slot.startTime) || !_isClockTime(slot.endTime),
  )) {
    return const ScheduleValidation.invalid(ScheduleProblem.malformedTime, day);
  }
  final ordered = List<WeeklySlot>.from(intervals)
    ..sort((a, b) => a.startTime.compareTo(b.startTime));
  if (ordered.any(
    (slot) => _minutesOf(slot.startTime) >= _minutesOf(slot.endTime),
  )) {
    return const ScheduleValidation.invalid(
      ScheduleProblem.endNotAfterStart,
      day,
    );
  }
  if (ordered.any((slot) => !isWithinDaytime(slot.startTime, slot.endTime))) {
    return const ScheduleValidation.invalid(
      ScheduleProblem.outsideDaytime,
      day,
    );
  }
  for (var i = 1; i < ordered.length; i++) {
    if (_minutesOf(ordered[i - 1].endTime) > _minutesOf(ordered[i].startTime)) {
      return const ScheduleValidation.invalid(ScheduleProblem.overlapping, day);
    }
  }
  return const ScheduleValidation.valid();
}

/// Validates a whole week and returns the first problem it finds.
ScheduleValidation validateWeeklySchedule(Map<int, List<WeeklySlot>> week) {
  for (final entry in week.entries) {
    final result = validateDayIntervals(entry.value);
    if (result.isValid) continue;
    return ScheduleValidation.invalid(result.problem!, entry.key);
  }
  return const ScheduleValidation.valid();
}

/// True when every interval is well-ordered and no two overlap.
bool areIntervalsValid(List<WeeklySlot> intervals) =>
    validateDayIntervals(intervals).isValid;

abstract interface class AvailabilityGateway {
  Future<List<WeeklySlot>> weekly();
  Future<List<WeeklySlot>> replaceWeekly(List<WeeklySlot> slots);
  Future<List<AvailabilityExceptionItem>> exceptions();
  Future<AvailabilityExceptionItem> addException({
    required String date,
    String? startTime,
    String? endTime,
    required String type,
    String? reason,
  });
  Future<void> deleteException(String id);
  Future<List<SlotDay>> slots({
    required String expertId,
    required int serviceId,
    required String from,
    required String to,
  });
}

class AvailabilityApi implements AvailabilityGateway {
  AvailabilityApi(this._client);

  final ApiClient _client;

  List<WeeklySlot> _weeklyList(Object? data) {
    if (data is! List<Object?>) {
      throw const FormatException('Invalid API response');
    }
    return data
        .whereType<JsonObject>()
        .map(WeeklySlot.fromJson)
        .toList(growable: false);
  }

  @override
  Future<List<WeeklySlot>> weekly() async {
    final body = await _client.get<JsonObject>(
      '/api/v1/experts/me/availability',
      authenticated: true,
    );
    return _weeklyList(body['data']);
  }

  @override
  Future<List<WeeklySlot>> replaceWeekly(List<WeeklySlot> slots) async {
    final body = await _client.put<JsonObject>(
      '/api/v1/experts/me/availability',
      data: {
        'slots': slots.map((item) => item.toJson()).toList(growable: false),
      },
      authenticated: true,
    );
    return _weeklyList(body['data']);
  }

  @override
  Future<List<AvailabilityExceptionItem>> exceptions() async {
    final body = await _client.get<JsonObject>(
      '/api/v1/experts/me/availability-exceptions',
      authenticated: true,
    );
    final data = body['data'];
    if (data is! List<Object?>) {
      throw const FormatException('Invalid API response');
    }
    return data
        .whereType<JsonObject>()
        .map(AvailabilityExceptionItem.fromJson)
        .toList(growable: false);
  }

  @override
  Future<AvailabilityExceptionItem> addException({
    required String date,
    String? startTime,
    String? endTime,
    required String type,
    String? reason,
  }) async {
    final body = await _client.post<JsonObject>(
      '/api/v1/experts/me/availability-exceptions',
      data: {
        'date': date,
        'startTime': startTime,
        'endTime': endTime,
        'type': type,
        if (reason != null && reason.isNotEmpty) 'reason': reason,
      },
      authenticated: true,
    );
    final data = body['data'];
    if (data is! JsonObject) {
      throw const FormatException('Invalid API response');
    }
    return AvailabilityExceptionItem.fromJson(data);
  }

  @override
  Future<void> deleteException(String id) async {
    await _client.delete<Object?>(
      '/api/v1/experts/me/availability-exceptions/$id',
      authenticated: true,
    );
  }

  @override
  Future<List<SlotDay>> slots({
    required String expertId,
    required int serviceId,
    required String from,
    required String to,
  }) async {
    final body = await _client.get<JsonObject>(
      '/api/v1/experts/$expertId/slots',
      query: {'serviceId': serviceId, 'from': from, 'to': to},
    );
    final data = body['data'];
    if (data is! JsonObject) {
      throw const FormatException('Invalid API response');
    }
    final days = data['days'];
    if (days is! List<Object?>) {
      throw const FormatException('Invalid API response');
    }
    return days
        .whereType<JsonObject>()
        .map(SlotDay.fromJson)
        .toList(growable: false);
  }
}
