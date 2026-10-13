import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_customer/src/addresses_screen.dart';
import 'package:lamsa_customer/src/location_picker_screen.dart';
import 'package:lamsa_design_system/lamsa_design_system.dart';
import 'package:lamsa_localization/lamsa_localization.dart';
import 'package:lamsa_networking/lamsa_networking.dart';
import 'package:latlong2/latlong.dart';

void main() {
  testWidgets('addresses show empty state', (tester) async {
    final gateway = FakeAddressGateway(pages: {1: addressPage(const [])});
    await tester.pumpWidget(
      testApp(
        AddressesScreen(gateway: gateway, catalogGateway: FakeCitiesGateway()),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      tester.widget<LamsaStatusView>(find.byType(LamsaStatusView)).status,
      LamsaStatus.empty,
    );
  });

  testWidgets('addresses append the next page', (tester) async {
    final gateway = FakeAddressGateway(
      pages: {
        1: addressPage([address('a1', 'First')], hasNext: true),
        2: addressPage([address('a2', 'Second')], page: 2),
      },
    );
    await tester.pumpWidget(
      testApp(
        AddressesScreen(gateway: gateway, catalogGateway: FakeCitiesGateway()),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('addresses-load-more')));
    await tester.pumpAndSettle();

    expect(find.text('First'), findsOneWidget);
    expect(find.text('Second'), findsOneWidget);
    expect(gateway.listedPages, [1, 2]);
  });

  testWidgets('unconfigured city does not show a confirm action', (
    tester,
  ) async {
    await tester.pumpWidget(
      testApp(
        LocationPickerScreen(
          city: const CatalogCity(
            id: 1,
            name: 'Unconfigured',
            code: 'NONE',
            isActive: true,
          ),
          mapConfiguration: testMapConfiguration,
        ),
      ),
    );

    expect(
      tester.widget<LamsaStatusView>(find.byType(LamsaStatusView)).status,
      LamsaStatus.error,
    );
    expect(find.byKey(const Key('location-map')), findsNothing);
    expect(find.byKey(const Key('confirm-location')), findsNothing);
  });

  testWidgets('picker passes city bounds and an in-bounds existing marker', (
    tester,
  ) async {
    MapBounds? receivedBounds;
    LatLng? receivedPoint;
    await tester.pumpWidget(
      testApp(
        LocationPickerScreen(
          city: readyCity(1, 'First'),
          mapConfiguration: testMapConfiguration,
          initialSelection: const LocationSelection(
            lat: '30.100000',
            lng: '31.200000',
          ),
          mapBuilder: (context, bounds, point, onPointSelected) {
            receivedBounds = bounds;
            receivedPoint = point;
            return const ColoredBox(color: Colors.white);
          },
        ),
      ),
    );

    expect(receivedBounds?.south, 29.9);
    expect(receivedBounds?.east, 31.5);
    expect(receivedPoint, const LatLng(30.1, 31.2));
    expect(find.byKey(const Key('selected-coordinates')), findsOneWidget);
  });

  testWidgets('map selection confirms six-decimal coordinates', (tester) async {
    final hostKey = GlobalKey<PickerHostState>();
    await tester.pumpWidget(
      testApp(
        PickerHost(
          key: hostKey,
          picker: LocationPickerScreen(
            city: readyCity(1, 'First'),
            mapConfiguration: testMapConfiguration,
            mapBuilder: (context, bounds, point, onPointSelected) {
              return TextButton(
                key: const Key('test-map-tap'),
                onPressed: () =>
                    onPointSelected(const LatLng(30.1234567, 31.2345678)),
                child: const SizedBox.expand(),
              );
            },
          ),
        ),
      ),
    );
    await tester.tap(find.byKey(const Key('open-picker')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('test-map-tap')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('confirm-location')));
    await tester.pumpAndSettle();

    expect(hostKey.currentState!.result?.lat, '30.123457');
    expect(hostKey.currentState!.result?.lng, '31.234568');
  });

  testWidgets('changing city clears an existing point', (tester) async {
    await tester.pumpWidget(
      testApp(
        AddressFormScreen(
          gateway: FakeAddressGateway(pages: const {}),
          cities: [readyCity(1, 'First'), readyCity(2, 'Second')],
          mapConfiguration: testMapConfiguration,
          address: existingAddress(),
        ),
      ),
    );

    expect(
      find.byKey(const Key('address-selected-coordinates')),
      findsOneWidget,
    );
    await tester.tap(find.byKey(const Key('address-city')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Second').last);
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('address-selected-coordinates')), findsNothing);
  });

  testWidgets('create cannot save without a selected point', (tester) async {
    final gateway = FakeAddressGateway(pages: const {});
    await tester.pumpWidget(
      testApp(
        AddressFormScreen(
          gateway: gateway,
          cities: [readyCity(1, 'First')],
          mapConfiguration: testMapConfiguration,
        ),
      ),
    );
    await enterRequiredAddressFields(tester);
    final saveButton = find.byKey(const Key('save-address'));
    await tester.drag(find.byType(ListView), const Offset(0, -250));
    await tester.pumpAndSettle();
    await tester.tap(saveButton);
    await tester.pump();

    expect(gateway.createCalls, 0);
    expect(find.byKey(const Key('address-location-error')), findsOneWidget);
  });

  testWidgets('edit preserves and submits the existing point', (tester) async {
    final gateway = FakeAddressGateway(pages: const {});
    await tester.pumpWidget(
      testApp(
        AddressFormScreen(
          gateway: gateway,
          cities: [readyCity(1, 'First')],
          mapConfiguration: testMapConfiguration,
          address: existingAddress(),
        ),
      ),
    );
    final saveButton = find.byKey(const Key('save-address'));
    await tester.drag(find.byType(ListView), const Offset(0, -250));
    await tester.pumpAndSettle();
    await tester.tap(saveButton);
    await tester.pumpAndSettle();

    expect(gateway.updateCalls, 1);
    expect(gateway.updatedDraft?.lat, '30.100000');
    expect(gateway.updatedDraft?.lng, '31.200000');
    expect(gateway.updatedDraft?.includeCoordinates, isTrue);
  });

  testWidgets(
    'outside-city backend error is visible without losing form state',
    (tester) async {
      const message = 'Selected point is outside the city';
      final gateway = FakeAddressGateway(
        pages: const {},
        createFailure: const ApiFailure(
          kind: ApiFailureKind.validation,
          code: 'ADDRESS_OUTSIDE_CITY',
          message: message,
          statusCode: 422,
        ),
      );
      await tester.pumpWidget(
        testApp(
          AddressFormScreen(
            gateway: gateway,
            cities: [readyCity(1, 'First')],
            mapConfiguration: testMapConfiguration,
            locationPickerBuilder: (city, initialSelection) =>
                const TestLocationRoute(),
          ),
        ),
      );
      await enterRequiredAddressFields(tester);
      await tester.tap(find.byKey(const Key('choose-address-location')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('return-test-location')));
      await tester.pumpAndSettle();
      final saveButton = find.byKey(const Key('save-address'));
      await tester.drag(find.byType(ListView), const Offset(0, -250));
      await tester.pumpAndSettle();
      await tester.tap(saveButton);
      await tester.pumpAndSettle();

      expect(find.text(message), findsOneWidget);
      expect(find.text('Home'), findsOneWidget);
      expect(
        find.byKey(const Key('address-selected-coordinates')),
        findsOneWidget,
      );
      expect(gateway.createCalls, 1);
    },
  );

  test('city location JSON is strict and missing location is compatible', () {
    final ready = CatalogCity.fromJson({
      'id': 1,
      'name': 'Cairo',
      'code': 'CAI',
      'isActive': true,
      'location': {
        'status': 'ready',
        'bounds': {
          'south': '29.9',
          'west': '31.0',
          'north': '30.3',
          'east': '31.5',
        },
      },
    });
    final legacy = CatalogCity.fromJson({
      'id': 2,
      'name': 'Legacy',
      'code': null,
      'isActive': true,
    });

    expect(ready.location.status, CityLocationStatus.ready);
    expect(ready.location.bounds?.contains(30, 31.2), isTrue);
    expect(legacy.location.status, CityLocationStatus.notConfigured);
    expect(
      () => CatalogCity.fromJson({
        'id': 3,
        'name': 'Invalid',
        'code': null,
        'isActive': true,
        'location': {'status': 'unknown'},
      }),
      throwsFormatException,
    );
  });
}

Future<void> enterRequiredAddressFields(WidgetTester tester) async {
  await tester.enterText(find.byKey(const Key('address-label')), 'Home');
  await tester.enterText(
    find.byKey(const Key('address-text')),
    'A valid detailed address',
  );
}

Widget testApp(Widget child) => MaterialApp(
  locale: const Locale('en'),
  supportedLocales: LamsaLocalizations.supportedLocales,
  localizationsDelegates: LamsaLocalizations.localizationsDelegates,
  theme: LamsaTheme.light(),
  home: child,
);

CatalogCity readyCity(int id, String name) => CatalogCity(
  id: id,
  name: name,
  code: 'TEST$id',
  isActive: true,
  location: const CityLocation.ready(
    MapBounds(south: 29.9, west: 31, north: 30.3, east: 31.5),
  ),
);

final testMapConfiguration = PublicMapConfiguration(
  tileUrlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  minZoom: 0,
  maxZoom: 19,
  attributionUrl: Uri.parse('https://www.openstreetmap.org/copyright'),
  reportIssueUrl: Uri.parse('https://www.openstreetmap.org/fixthemap'),
);

CustomerAddress existingAddress() => const CustomerAddress(
  id: 'a1',
  label: 'Home',
  addressText: 'Long existing address',
  cityId: 1,
  lat: '30.100000',
  lng: '31.200000',
  isDefault: false,
);

CustomerAddress address(String id, String label) => CustomerAddress(
  id: id,
  label: label,
  addressText: 'Test address text',
  cityId: 1,
  lat: '30.100000',
  lng: '31.200000',
  isDefault: false,
);

CatalogPage<CustomerAddress> addressPage(
  List<CustomerAddress> items, {
  int page = 1,
  bool hasNext = false,
}) => CatalogPage(items: items, page: page, limit: 20, hasNext: hasNext);

class PickerHost extends StatefulWidget {
  const PickerHost({required this.picker, super.key});

  final Widget picker;

  @override
  State<PickerHost> createState() => PickerHostState();
}

class PickerHostState extends State<PickerHost> {
  LocationSelection? result;

  @override
  Widget build(BuildContext context) => Scaffold(
    body: TextButton(
      key: const Key('open-picker'),
      onPressed: () async {
        result = await Navigator.push<LocationSelection>(
          context,
          MaterialPageRoute(builder: (_) => widget.picker),
        );
        setState(() {});
      },
      child: const Text('test'),
    ),
  );
}

class TestLocationRoute extends StatelessWidget {
  const TestLocationRoute({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    body: TextButton(
      key: const Key('return-test-location'),
      onPressed: () => Navigator.pop(
        context,
        const LocationSelection(lat: '30.120000', lng: '31.230000'),
      ),
      child: const Text('test'),
    ),
  );
}

class FakeAddressGateway implements AddressGateway {
  FakeAddressGateway({required this.pages, this.createFailure});

  final Map<int, CatalogPage<CustomerAddress>> pages;
  final ApiFailure? createFailure;
  final listedPages = <int>[];
  int updateCalls = 0;
  int createCalls = 0;
  AddressDraft? updatedDraft;

  @override
  Future<CatalogPage<CustomerAddress>> list({
    int page = 1,
    int limit = 20,
  }) async {
    listedPages.add(page);
    return pages[page] ?? addressPage(const []);
  }

  @override
  Future<CustomerAddress> create({
    required String label,
    required String addressText,
    required int cityId,
    required String lat,
    required String lng,
    bool isDefault = false,
  }) async {
    createCalls++;
    if (createFailure != null) throw createFailure!;
    return CustomerAddress(
      id: 'created',
      label: label,
      addressText: addressText,
      cityId: cityId,
      lat: lat,
      lng: lng,
      isDefault: isDefault,
    );
  }

  @override
  Future<void> delete(String id) async {}

  @override
  Future<CustomerAddress> update(String id, AddressDraft input) async {
    updateCalls++;
    updatedDraft = input;
    return CustomerAddress(
      id: id,
      label: input.label ?? 'Home',
      addressText: input.addressText ?? 'Test address text',
      cityId: input.cityId ?? 1,
      lat: input.lat,
      lng: input.lng,
      isDefault: input.isDefault ?? false,
    );
  }
}

class FakeCitiesGateway implements CatalogGateway {
  @override
  Future<PublicMapConfiguration> mapConfiguration() async =>
      testMapConfiguration;

  @override
  Future<List<CatalogCity>> cities() async => [readyCity(1, 'Test city')];

  @override
  Future<ExpertDetail> expert(String id) => throw UnimplementedError();

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
  Future<List<PortfolioItem>> portfolio(
    String expertId, {
    bool authenticated = false,
  }) => throw UnimplementedError();

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
  }) => throw UnimplementedError();

  @override
  Future<CatalogPage<CatalogService>> services({
    int page = 1,
    int limit = 20,
  }) => throw UnimplementedError();
}
