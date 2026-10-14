import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_expert/src/availability_screen.dart';
import 'package:lamsa_localization/lamsa_localization.dart';

void main() {
  testWidgets('weekly schedule renders ISO days and saves through the server', (
    tester,
  ) async {
    final gateway = _AvailabilityGateway(
      weeklyValue: const [
        WeeklySlot(dayOfWeek: 1, startTime: '09:00', endTime: '12:00'),
      ],
    );
    await tester.pumpWidget(
      _app(ExpertAvailabilityScreen(availability: gateway)),
    );
    await tester.pumpAndSettle();

    expect(find.text('الإثنين'), findsOneWidget);
    expect(find.text('09:00 – 12:00'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('الأحد'),
      400,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('الأحد'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('availability-save')));
    await tester.pumpAndSettle();

    expect(gateway.saved, hasLength(1));
    expect(gateway.saved!.first.dayOfWeek, 1);
    expect(find.text('حُفظ الجدول من الخادم'), findsOneWidget);
  });

  testWidgets('overlapping local edits show a message before any save', (
    tester,
  ) async {
    final gateway = _AvailabilityGateway(weeklyValue: const []);
    await tester.pumpWidget(
      _app(ExpertAvailabilityScreen(availability: gateway)),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('interval-add-2')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('interval-start')),
      '09:00',
    );
    await tester.enterText(find.byKey(const ValueKey('interval-end')), '12:00');
    await tester.tap(find.text('إضافة فترة').last);
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('interval-add-2')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('interval-start')),
      '11:00',
    );
    await tester.enterText(find.byKey(const ValueKey('interval-end')), '13:00');
    await tester.tap(find.text('إضافة فترة').last);
    await tester.pumpAndSettle();

    expect(find.text('فترات اليوم الواحد يجب ألا تتداخل.'), findsOneWidget);
    expect(gateway.saved, isNull);
  });

  testWidgets('full-day exception is created and listed', (tester) async {
    final gateway = _AvailabilityGateway(weeklyValue: const []);
    await tester.pumpWidget(
      _app(ExpertAvailabilityScreen(availability: gateway)),
    );
    await tester.pumpAndSettle();

    expect(find.text('لا توجد استثناءات حالية.'), findsNothing);
    await tester.scrollUntilVisible(
      find.text('لا توجد استثناءات حالية.'),
      400,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('لا توجد استثناءات حالية.'), findsOneWidget);

    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('exception-add')),
      400,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.byKey(const ValueKey('exception-add')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('exception-date')),
      '2026-10-20',
    );
    await tester.tap(find.text('إضافة استثناء').last);
    await tester.pumpAndSettle();

    expect(gateway.addedDate, '2026-10-20');
    expect(gateway.addedStart, isNull);
    expect(find.text('2026-10-20'), findsOneWidget);
  });

  Future<void> openExceptionDialog(WidgetTester tester) async {
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('exception-add')),
      400,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.byKey(const ValueKey('exception-add')));
    await tester.pumpAndSettle();
  }

  testWidgets('impossible calendar dates are rejected', (tester) async {
    final gateway = _AvailabilityGateway(weeklyValue: const []);
    await tester.pumpWidget(
      _app(ExpertAvailabilityScreen(availability: gateway)),
    );
    await tester.pumpAndSettle();
    await openExceptionDialog(tester);

    await tester.enterText(
      find.byKey(const ValueKey('exception-date')),
      '2026-99-99',
    );
    await tester.tap(find.text('إضافة استثناء').last);
    await tester.pumpAndSettle();

    expect(find.text('تاريخ غير صالح، تحققي من الشهر واليوم'), findsOneWidget);
    expect(gateway.addedDate, isNull);

    await tester.enterText(
      find.byKey(const ValueKey('exception-date')),
      '2026-02-30',
    );
    await tester.tap(find.text('إضافة استثناء').last);
    await tester.pumpAndSettle();

    expect(find.text('تاريخ غير صالح، تحققي من الشهر واليوم'), findsOneWidget);
    expect(gateway.addedDate, isNull);
  });

  testWidgets('past dates are rejected against Cairo today', (tester) async {
    final gateway = _AvailabilityGateway(weeklyValue: const []);
    await tester.pumpWidget(
      _app(ExpertAvailabilityScreen(availability: gateway)),
    );
    await tester.pumpAndSettle();
    await openExceptionDialog(tester);

    await tester.enterText(
      find.byKey(const ValueKey('exception-date')),
      '2000-01-01',
    );
    await tester.tap(find.text('إضافة استثناء').last);
    await tester.pumpAndSettle();

    expect(
      find.text('الاستثناء يجب أن يكون لتاريخ اليوم أو مستقبل.'),
      findsOneWidget,
    );
    expect(gateway.addedDate, isNull);
  });

  testWidgets('non-clock times are rejected in intervals', (tester) async {
    final gateway = _AvailabilityGateway(weeklyValue: const []);
    await tester.pumpWidget(
      _app(ExpertAvailabilityScreen(availability: gateway)),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('interval-add-1')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('interval-start')),
      '24:00',
    );
    await tester.enterText(find.byKey(const ValueKey('interval-end')), '12:00');
    await tester.tap(find.text('إضافة فترة').last);
    await tester.pumpAndSettle();

    expect(find.text('استخدمي صيغة HH:MM بصيغة 24 ساعة'), findsOneWidget);
    expect(gateway.saved, isNull);

    await tester.enterText(
      find.byKey(const ValueKey('interval-start')),
      '99:99',
    );
    await tester.tap(find.text('إضافة فترة').last);
    await tester.pumpAndSettle();

    expect(find.text('استخدمي صيغة HH:MM بصيغة 24 ساعة'), findsOneWidget);
    expect(gateway.saved, isNull);
  });

  testWidgets('partial exception requires end after start', (tester) async {
    final gateway = _AvailabilityGateway(weeklyValue: const []);
    await tester.pumpWidget(
      _app(ExpertAvailabilityScreen(availability: gateway)),
    );
    await tester.pumpAndSettle();
    await openExceptionDialog(tester);

    await tester.tap(find.byType(SwitchListTile));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('exception-date')),
      '2099-02-02',
    );
    await tester.enterText(
      find.byKey(const ValueKey('exception-start')),
      '14:00',
    );
    await tester.enterText(
      find.byKey(const ValueKey('exception-end')),
      '12:00',
    );
    await tester.tap(find.text('إضافة استثناء').last);
    await tester.pumpAndSettle();

    expect(find.text('وقت النهاية يجب أن يكون بعد البداية.'), findsOneWidget);
    expect(gateway.addedDate, isNull);
  });

  testWidgets('partial exception needs both times together', (tester) async {
    final gateway = _AvailabilityGateway(weeklyValue: const []);
    await tester.pumpWidget(
      _app(ExpertAvailabilityScreen(availability: gateway)),
    );
    await tester.pumpAndSettle();
    await openExceptionDialog(tester);

    await tester.tap(find.byType(SwitchListTile));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('exception-date')),
      '2099-02-02',
    );
    await tester.enterText(
      find.byKey(const ValueKey('exception-start')),
      '10:00',
    );
    await tester.tap(find.text('إضافة استثناء').last);
    await tester.pumpAndSettle();

    expect(find.text('استخدمي صيغة HH:MM بصيغة 24 ساعة'), findsOneWidget);
    expect(gateway.addedDate, isNull);
  });

  testWidgets('valid full-day exception is created', (tester) async {
    final gateway = _AvailabilityGateway(weeklyValue: const []);
    await tester.pumpWidget(
      _app(ExpertAvailabilityScreen(availability: gateway)),
    );
    await tester.pumpAndSettle();
    await openExceptionDialog(tester);

    await tester.enterText(
      find.byKey(const ValueKey('exception-date')),
      '2099-01-01',
    );
    await tester.tap(find.text('إضافة استثناء').last);
    await tester.pumpAndSettle();

    expect(gateway.addedDate, '2099-01-01');
    expect(gateway.addedStart, isNull);
    expect(find.text('2099-01-01'), findsOneWidget);
  });

  testWidgets('valid partial exception is created with both times', (
    tester,
  ) async {
    final gateway = _AvailabilityGateway(weeklyValue: const []);
    await tester.pumpWidget(
      _app(ExpertAvailabilityScreen(availability: gateway)),
    );
    await tester.pumpAndSettle();
    await openExceptionDialog(tester);

    await tester.tap(find.byType(SwitchListTile));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('exception-date')),
      '2099-02-02',
    );
    await tester.enterText(
      find.byKey(const ValueKey('exception-start')),
      '10:00',
    );
    await tester.enterText(
      find.byKey(const ValueKey('exception-end')),
      '12:00',
    );
    await tester.tap(find.text('إضافة استثناء').last);
    await tester.pumpAndSettle();

    expect(gateway.addedDate, '2099-02-02');
    expect(gateway.addedStart, '10:00');
    expect(gateway.addedEnd, '12:00');
    expect(find.text('2099-02-02'), findsOneWidget);
  });

  testWidgets('RTL weekday order starts with Monday', (tester) async {
    final gateway = _AvailabilityGateway(weeklyValue: const []);
    await tester.pumpWidget(
      _app(ExpertAvailabilityScreen(availability: gateway)),
    );
    await tester.pumpAndSettle();

    // Monday renders first; Sunday is lazily built only after scrolling down.
    expect(find.text('الإثنين'), findsOneWidget);
    expect(find.text('الأحد'), findsNothing);
    await tester.scrollUntilVisible(
      find.text('الأحد'),
      400,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('الأحد'), findsOneWidget);
  });
}

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
  String? addedDate;
  String? addedStart;
  String? addedEnd;

  @override
  Future<List<WeeklySlot>> weekly() async => weeklyValue;

  @override
  Future<List<WeeklySlot>> replaceWeekly(List<WeeklySlot> slots) async {
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
  }) async {
    addedDate = date;
    addedStart = startTime;
    addedEnd = endTime;
    return AvailabilityExceptionItem(
      id: 'e1',
      date: date,
      type: type,
      startTime: startTime,
      endTime: endTime,
      reason: reason,
    );
  }

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
