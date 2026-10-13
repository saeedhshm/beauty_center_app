import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_customer/src/cairo_slot_time.dart';
import 'package:lamsa_customer/src/catalog_screen.dart';
import 'package:lamsa_design_system/lamsa_design_system.dart';
import 'package:lamsa_localization/lamsa_localization.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

void main() {
  setUpAll(ensureCairoTime);

  test('cairo clock conversion respects DST', () {
    // 2026-10-20 is inside Egypt DST (UTC+3).
    expect(cairoClockOf('2026-10-20T07:00:00.000Z'), '10:00');
    // 2026-12-20 is standard time (UTC+2).
    expect(cairoClockOf('2026-12-20T07:00:00.000Z'), '09:00');
  });

  testWidgets('slots render Cairo times with duration and price', (
    tester,
  ) async {
    final slots = _SlotsGateway(
      onFetch: () async => const [
        SlotDay(
          date: '2026-10-20',
          slots: [
            ExpertSlot(
              startsAt: '2026-10-20T07:00:00.000Z',
              endsAt: '2026-10-20T08:00:00.000Z',
            ),
          ],
        ),
      ],
    );
    await tester.pumpWidget(
      testApp(
        ExpertDetailScreen(
          gateway: _DetailGateway(),
          availability: slots,
          expertId: 'expert-1',
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('المواعيد المتاحة'), findsOneWidget);
    expect(find.text('10:00 – 11:00'), findsOneWidget);
    expect(find.textContaining('60 دقيقة'), findsWidgets);
    expect(find.text('300.50 EGP · 60 دقيقة'), findsOneWidget);
    expect(slots.calls.single.serviceId, 7);
  });

  testWidgets('day change refetches and ignores stale responses', (
    tester,
  ) async {
    ensureCairoTime();
    final today = nextCairoDates(now: DateTime.now()).first;
    final first = Completer<List<SlotDay>>();
    final slots = _SlotsGateway(deferred: {today: first});
    await tester.pumpWidget(
      testApp(
        ExpertDetailScreen(
          gateway: _DetailGateway(),
          availability: slots,
          expertId: 'expert-1',
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    // Switch to the second day while the first request is still pending.
    final secondDay = nextCairoDates(now: DateTime.now())[1];
    await tester.ensureVisible(find.byKey(ValueKey('slots-day-$secondDay')));
    await tester.pump(const Duration(milliseconds: 100));
    await tester.tap(find.byKey(ValueKey('slots-day-$secondDay')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(slots.calls.last.date, secondDay);

    // The stale first response must not overwrite the second day.
    first.complete(const [
      SlotDay(
        date: 'stale',
        slots: [
          ExpertSlot(
            startsAt: '2026-10-20T07:00:00.000Z',
            endsAt: '2026-10-20T08:00:00.000Z',
          ),
        ],
      ),
    ]);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('10:00 – 11:00'), findsNothing);
  });

  testWidgets('empty day shows guidance and errors retry', (tester) async {
    var fails = true;
    final slots = _SlotsGateway(
      onFetch: () async {
        if (fails) {
          throw const ApiFailure(
            kind: ApiFailureKind.server,
            code: 'FAILED',
            message: 'server failed',
          );
        }
        return const [];
      },
    );
    await tester.pumpWidget(
      testApp(
        ExpertDetailScreen(
          gateway: _DetailGateway(),
          availability: slots,
          expertId: 'expert-1',
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('server failed'), findsOneWidget);

    fails = false;
    await tester.ensureVisible(find.byKey(const ValueKey('slots-error')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('إعادة المحاولة'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('لا توجد مواعيد'));
    await tester.pumpAndSettle();
    expect(find.text('لا توجد مواعيد'), findsOneWidget);
  });
}

Widget testApp(Widget child) => MaterialApp(
  locale: const Locale('ar'),
  supportedLocales: LamsaLocalizations.supportedLocales,
  localizationsDelegates: LamsaLocalizations.localizationsDelegates,
  theme: LamsaTheme.light(),
  home: child,
);

ExpertDetail _detailData() => const ExpertDetail(
  id: 'expert-1',
  name: 'خبيرة الاختبار',
  cityId: 1,
  cityName: 'القاهرة',
  bio: null,
  ratingAvg: '4.50',
  ratingCount: 2,
  services: [
    ExpertOffering(
      serviceId: 7,
      name: 'تصفيف الشعر',
      description: null,
      durationMin: 60,
      price: '300.50',
      currency: 'EGP',
      isActive: true,
      serviceIsActive: true,
    ),
  ],
);

class _DetailGateway implements CatalogGateway {
  @override
  Future<PublicMapConfiguration> mapConfiguration() =>
      throw UnimplementedError();

  @override
  Future<List<CatalogCity>> cities() => throw UnimplementedError();

  @override
  Future<CatalogPage<CatalogService>> services({int page = 1, int limit = 20}) =>
      throw UnimplementedError();

  @override
  Future<CatalogPage<PublicExpert>> experts({
    int page = 1,
    int limit = 20,
    int? cityId,
    int? serviceId,
    String? q,
    ExpertSort sort = ExpertSort.nameAsc,
  }) => throw UnimplementedError();

  @override
  Future<ExpertDetail> expert(String id) async => _detailData();

  @override
  Future<List<PortfolioItem>> portfolio(
    String expertId, {
    bool authenticated = false,
  }) async => const [];

  @override
  Future<List<int>> portfolioBytes(
    String relativeUrl, {
    bool authenticated = false,
  }) => throw UnimplementedError();

  @override
  Future<CatalogPage<PublicReview>> reviews(
    String expertId, {
    int page = 1,
    int limit = 20,
  }) async => const CatalogPage(
    items: <PublicReview>[],
    page: 1,
    limit: 20,
    hasNext: false,
  );
}

class _SlotCall {
  _SlotCall(this.serviceId, this.date);
  final int serviceId;
  final String date;
}

class _SlotsGateway implements AvailabilityGateway {
  _SlotsGateway({this.deferred = const {}, this.onFetch});

  final Map<String, Completer<List<SlotDay>>> deferred;
  final Future<List<SlotDay>> Function()? onFetch;
  final calls = <_SlotCall>[];

  @override
  Future<List<WeeklySlot>> weekly() => throw UnimplementedError();

  @override
  Future<List<WeeklySlot>> replaceWeekly(List<WeeklySlot> slots) =>
      throw UnimplementedError();

  @override
  Future<List<AvailabilityExceptionItem>> exceptions() =>
      throw UnimplementedError();

  @override
  Future<AvailabilityExceptionItem> addException({
    required String date,
    String? startTime,
    String? endTime,
    required String type,
    String? reason,
  }) => throw UnimplementedError();

  @override
  Future<void> deleteException(String id) => throw UnimplementedError();

  @override
  Future<List<SlotDay>> slots({
    required String expertId,
    required int serviceId,
    required String from,
    required String to,
  }) async {
    calls.add(_SlotCall(serviceId, from));
    final pending = deferred[from];
    if (pending != null) return pending.future;
    if (onFetch != null) return onFetch!();
    return const [];
  }
}
