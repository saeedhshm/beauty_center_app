import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lamsa_authentication/lamsa_authentication.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_expert/src/app.dart';

void main() {
  testWidgets('pending expert is gated to profile and approval state', (
    tester,
  ) async {
    final gateway = FakeGateway();
    final manager = SessionManager(
      expectedRole: AuthRole.expert,
      gateway: gateway,
      store: MemorySessionStore(),
    );
    await manager.login(phone: '01012345678', password: 'password-1234');

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          sessionManagerProvider.overrideWithValue(manager),
          expertApiProvider.overrideWithValue(FakeExpertGateway()),
          expertWorkspaceApiProvider.overrideWithValue(FakeWorkspaceGateway()),
          catalogApiProvider.overrideWithValue(FakeCatalogGateway()),
          networkStateProvider.overrideWith((ref) => Stream.value(true)),
        ],
        child: const ExpertApp(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('ملفكِ قيد مراجعة الإدارة'), findsOneWidget);
    expect(find.text('ملف الخبيرة'), findsWidgets);
    expect(find.text('اختيار ورفع الوثيقة'), findsOneWidget);
    final acceptingSwitch = tester.widget<SwitchListTile>(
      find.byKey(const ValueKey('accepting-bookings-switch')),
    );
    expect(acceptingSwitch.onChanged, isNull);
    expect(find.byIcon(Icons.spa_outlined), findsOneWidget);
    expect(find.byIcon(Icons.photo_library_outlined), findsOneWidget);
  });
}

class FakeGateway implements AuthGateway {
  AuthSession get value => AuthSession(
    user: AuthUser(
      id: '00000000-0000-4000-8000-000000000001',
      name: 'خبيرة اختبار',
      phone: '+201012345678',
      role: AuthRole.expert,
      phoneVerified: true,
    ),
    accessToken: 'access',
    refreshToken: 'refresh',
    accessExpiresAt: DateTime.now().add(const Duration(minutes: 15)),
    refreshExpiresAt: DateTime.now().add(const Duration(days: 30)),
  );
  @override
  Future<AuthSession> login({
    required String phone,
    required String password,
  }) async => value;
  @override
  Future<void> logout(String refreshToken) async {}
  @override
  Future<AuthSession> refresh(String refreshToken) async => value;
  @override
  Future<AuthSession> register({
    required String phone,
    required String challengeId,
    required String otp,
    required String name,
    required String password,
    required AuthRole role,
  }) async => value;
  @override
  Future<OtpChallenge> requestPasswordOtp(String phone) =>
      throw UnimplementedError();
  @override
  Future<OtpChallenge> requestRegistrationOtp(String phone) =>
      throw UnimplementedError();
  @override
  Future<void> resetPassword({
    required String phone,
    required String challengeId,
    required String otp,
    required String newPassword,
  }) async {}
}

class FakeExpertGateway implements ExpertGateway {
  @override
  Future<List<LaunchCity>> cities() async => const [
    LaunchCity(id: 1, name: 'القاهرة', code: 'cairo'),
  ];
  @override
  Future<ExpertProfile> profile() async => const ExpertProfile(
    userId: '00000000-0000-4000-8000-000000000001',
    name: 'خبيرة اختبار',
    cityId: 1,
    bio: 'خبيرة عناية',
    approvalStatus: ExpertApprovalStatus.pending,
    isAcceptingBookings: false,
  );
  @override
  Future<ExpertProfile> updateProfile({
    required String name,
    required String? bio,
    required int cityId,
  }) => profile();
  @override
  Future<ExpertProfile> setAcceptingBookings(bool isAcceptingBookings) async =>
      ExpertProfile(
        userId: '00000000-0000-4000-8000-000000000001',
        name: 'خبيرة اختبار',
        cityId: 1,
        bio: 'خبيرة عناية',
        approvalStatus: ExpertApprovalStatus.pending,
        isAcceptingBookings: isAcceptingBookings,
      );
  @override
  Future<void> uploadIdentityDocument({
    required List<int> bytes,
    required String filename,
    required String contentType,
  }) async {}
}

class FakeWorkspaceGateway implements ExpertWorkspaceGateway {
  @override
  Future<void> deletePortfolio(String id) async {}
  @override
  Future<List<PortfolioItem>> portfolio(String expertId) async => const [];
  @override
  Future<List<int>> portfolioBytes(String relativeUrl) async => const [];
  @override
  Future<List<ExpertService>> services() async => const [];
  @override
  Future<PortfolioItem> uploadPortfolio({
    required List<int> bytes,
    required String filename,
    required String contentType,
    int? serviceId,
  }) => throw UnimplementedError();
  @override
  Future<ExpertService> upsertService({
    required int serviceId,
    required String price,
    required bool isActive,
  }) => throw UnimplementedError();
}

class FakeCatalogGateway implements CatalogGateway {
  @override
  Future<List<CatalogCity>> cities() async => const [];
  @override
  Future<ExpertDetail> expert(String id) => throw UnimplementedError();
  @override
  Future<CatalogPage<PublicExpert>> experts({
    int page = 1,
    int limit = 20,
    int? cityId,
    int? serviceId,
    String? q,
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
  }) async => const CatalogPage(items: [], page: 1, limit: 20, hasNext: false);
}
