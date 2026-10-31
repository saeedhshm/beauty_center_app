import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_expert/src/availability_screen.dart';
import 'package:lamsa_localization/lamsa_localization.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

/// Local validation must be able to stop a save, not only explain one.
///
/// Every rule asserted here is already enforced by the server's
/// `weeklyScheduleSchema`: at most three intervals a day, ordered, inside
/// 09:00–22:00 Cairo, and non-overlapping. No rule is added or relaxed.
void main() {
  testWidgets(
    'an overlapping schedule cannot be saved and blocks the gateway',
    (tester) async {
      final gateway = _AvailabilityGateway(weeklyValue: const []);
      await tester.pumpWidget(
        _app(ExpertAvailabilityScreen(availability: gateway)),
      );
      await tester.pumpAndSettle();

      await _addInterval(tester, day: 2, start: '09:00', end: '12:00');
      await _addInterval(tester, day: 2, start: '11:00', end: '14:00');

      // The message names the actual problem...
      await _scrollToTop(tester);
      expect(find.byKey(const ValueKey('schedule-validation')), findsOneWidget);
      expect(find.text('فترات اليوم الواحد يجب ألا تتداخل.'), findsOneWidget);

      // ...and the save button refuses the action.
      await _scrollToSave(tester);
      expect(_saveButton(tester).onPressed, isNull);
      await tester.tap(
        find.byKey(const ValueKey('availability-save')),
        warnIfMissed: false,
      );
      await tester.pumpAndSettle();

      expect(gateway.replaceCalls, 0);
      expect(gateway.saved, isNull);

      // Fixing the overlap clears the message and lets the save through.
      await _scrollTo(
        tester,
        find.byKey(const ValueKey('interval-delete-2-1')),
      );
      await tester.tap(find.byKey(const ValueKey('interval-delete-2-1')));
      await tester.pumpAndSettle();
      await _scrollToTop(tester);
      expect(find.byKey(const ValueKey('schedule-validation')), findsNothing);

      await _scrollToSave(tester);
      expect(_saveButton(tester).onPressed, isNotNull);
      await tester.tap(find.byKey(const ValueKey('availability-save')));
      await tester.pumpAndSettle();

      expect(gateway.replaceCalls, 1);
      expect(gateway.saved, hasLength(1));
      expect(gateway.saved!.first.startTime, '09:00');
      expect(find.text('حُفظ الجدول من الخادم'), findsOneWidget);
    },
  );

  testWidgets(
    'an end before the start is refused in the dialog and not added',
    (tester) async {
      final gateway = _AvailabilityGateway(weeklyValue: const []);
      await tester.pumpWidget(
        _app(ExpertAvailabilityScreen(availability: gateway)),
      );
      await tester.pumpAndSettle();

      await _scrollTo(tester, find.byKey(const ValueKey('interval-add-3')));
      await tester.tap(find.byKey(const ValueKey('interval-add-3')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('interval-start')),
        '14:00',
      );
      await tester.enterText(
        find.byKey(const ValueKey('interval-end')),
        '10:00',
      );
      await tester.tap(find.text('إضافة فترة').last);
      await tester.pumpAndSettle();

      // The dialog refuses the reversed order, so nothing entered the schedule
      // and no request was made.
      expect(find.text('وقت النهاية يجب أن يكون بعد البداية.'), findsOneWidget);
      expect(gateway.replaceCalls, 0);
      await tester.tap(find.text('إلغاء').last);
      await tester.pumpAndSettle();

      await _scrollToTop(tester);
      expect(find.byKey(const ValueKey('schedule-validation')), findsNothing);
      await _scrollToSave(tester);
      expect(_saveButton(tester).onPressed, isNotNull);
    },
  );

  testWidgets('an interval outside daytime blocks the save', (tester) async {
    final gateway = _AvailabilityGateway(weeklyValue: const []);
    await tester.pumpWidget(
      _app(ExpertAvailabilityScreen(availability: gateway)),
    );
    await tester.pumpAndSettle();

    await _addInterval(tester, day: 4, start: '07:00', end: '10:00');

    await _scrollToTop(tester);
    expect(
      find.text('الفترة يجب أن تكون داخل 09:00–22:00 بتوقيت القاهرة.'),
      findsOneWidget,
    );
    await _scrollToSave(tester);
    expect(_saveButton(tester).onPressed, isNull);
    expect(gateway.replaceCalls, 0);
  });

  testWidgets('a fourth interval in one day blocks the save', (tester) async {
    final gateway = _AvailabilityGateway(weeklyValue: const []);
    await tester.pumpWidget(
      _app(ExpertAvailabilityScreen(availability: gateway)),
    );
    await tester.pumpAndSettle();

    await _addInterval(tester, day: 5, start: '09:00', end: '10:00');
    await _addInterval(tester, day: 5, start: '11:00', end: '12:00');
    await _addInterval(tester, day: 5, start: '13:00', end: '14:00');
    await _addInterval(tester, day: 5, start: '15:00', end: '16:00');

    await _scrollToTop(tester);
    expect(find.text('الحد الأقصى 3 فترات لليوم الواحد.'), findsOneWidget);
    await _scrollToSave(tester);
    expect(_saveButton(tester).onPressed, isNull);
    expect(gateway.replaceCalls, 0);

    await _scrollTo(tester, find.byKey(const ValueKey('interval-delete-5-3')));
    await tester.tap(find.byKey(const ValueKey('interval-delete-5-3')));
    await tester.pumpAndSettle();
    await _scrollToTop(tester);
    expect(find.byKey(const ValueKey('schedule-validation')), findsNothing);
  });

  testWidgets('a conflict from the server reloads the authoritative schedule', (
    tester,
  ) async {
    final gateway = _AvailabilityGateway(weeklyValue: const []);
    gateway.saveFailure = const ApiFailure(
      kind: ApiFailureKind.conflict,
      code: 'SLOT_CONFLICT',
      message: 'conflict',
    );
    await tester.pumpWidget(
      _app(ExpertAvailabilityScreen(availability: gateway)),
    );
    await tester.pumpAndSettle();

    await _addInterval(tester, day: 6, start: '09:00', end: '12:00');
    await _scrollToSave(tester);
    await tester.tap(find.byKey(const ValueKey('availability-save')));
    await tester.pumpAndSettle();

    // Local validation passed, so the request was made; the conflict then
    // forced a refetch instead of a local claim of success.
    expect(gateway.replaceCalls, 1);
    expect(gateway.weeklyCalls, 2);
    await _scrollToTop(tester);
    expect(
      find.text('تغيرت البيانات على الخادم. أُعيد تحميل الحالة الحالية.'),
      findsOneWidget,
    );
  });
}

/// The schedule list is lazy: a widget below the fold is not built yet, so it
/// cannot even be found. These helpers drag the list until the target is built.
Future<void> _scrollUntilBuilt(
  WidgetTester tester,
  Finder target, {
  int maxDrags = 24,
  double dy = -300,
}) async {
  for (var i = 0; i < maxDrags && target.evaluate().isEmpty; i++) {
    await tester.drag(find.byType(ListView).first, Offset(0, dy));
    await tester.pumpAndSettle();
  }
}

/// Sweeps from the top so any target is reachable, whichever direction the
/// previous step left the list scrolled in.
Future<void> _scrollTo(WidgetTester tester, Finder target) async {
  await _scrollUntilBuilt(tester, find.text('الجدول الأسبوعي'), dy: 300);
  await _scrollUntilBuilt(tester, target, dy: -300);
  if (target.evaluate().isEmpty) {
    throw TestFailure('could not reach $target');
  }
  await tester.ensureVisible(target);
  await tester.pumpAndSettle();
}

/// Back to the header, where the validation message is rendered.
Future<void> _scrollToTop(WidgetTester tester) =>
    _scrollUntilBuilt(tester, find.text('الجدول الأسبوعي'), dy: 300);

Future<void> _scrollToSave(WidgetTester tester) =>
    _scrollTo(tester, find.byKey(const ValueKey('availability-save')));

Future<void> _addInterval(
  WidgetTester tester, {
  required int day,
  required String start,
  required String end,
}) async {
  await _scrollTo(tester, find.byKey(ValueKey('interval-add-$day')));
  await tester.tap(find.byKey(ValueKey('interval-add-$day')));
  await tester.pumpAndSettle();
  await tester.enterText(find.byKey(const ValueKey('interval-start')), start);
  await tester.enterText(find.byKey(const ValueKey('interval-end')), end);
  await tester.tap(find.text('إضافة فترة').last);
  await tester.pumpAndSettle();
}

FilledButton _saveButton(WidgetTester tester) => tester.widget<FilledButton>(
  find.byKey(const ValueKey('availability-save')),
);

Widget _app(Widget child) => MaterialApp(
  locale: const Locale('ar'),
  supportedLocales: LamsaLocalizations.supportedLocales,
  localizationsDelegates: LamsaLocalizations.localizationsDelegates,
  home: Scaffold(body: child),
);

class _AvailabilityGateway implements AvailabilityGateway {
  _AvailabilityGateway({required this.weeklyValue});

  final List<WeeklySlot> weeklyValue;
  List<WeeklySlot>? saved;
  int replaceCalls = 0;
  int weeklyCalls = 0;
  ApiFailure? saveFailure;

  @override
  Future<List<WeeklySlot>> weekly() async {
    weeklyCalls++;
    return weeklyValue;
  }

  @override
  Future<List<WeeklySlot>> replaceWeekly(List<WeeklySlot> slots) async {
    replaceCalls++;
    final failure = saveFailure;
    if (failure != null) throw failure;
    saved = slots;
    return slots;
  }

  @override
  Future<List<AvailabilityExceptionItem>> exceptions() async => const [];

  @override
  Future<AvailabilityExceptionItem> addException({
    required String date,
    String? startTime,
    String? endTime,
    required String type,
    String? reason,
  }) async => AvailabilityExceptionItem(
    id: 'e1',
    date: date,
    type: type,
    startTime: startTime,
    endTime: endTime,
    reason: reason,
  );

  @override
  Future<void> deleteException(String id) async {}

  @override
  Future<List<SlotDay>> slots({
    required String expertId,
    required int serviceId,
    required String from,
    required String to,
  }) async => const [];
}
