import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lamsa_authentication/lamsa_authentication.dart';
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
          networkStateProvider.overrideWith((ref) => Stream.value(true)),
        ],
        child: const ExpertApp(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('ملفكِ قيد مراجعة الإدارة'), findsOneWidget);
    expect(find.text('ملف الخبيرة'), findsOneWidget);
    expect(find.text('اختيار ورفع الوثيقة'), findsOneWidget);
    expect(find.textContaining('إدارة الخدمات'), findsNothing);
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
  Future<void> uploadIdentityDocument({
    required List<int> bytes,
    required String filename,
    required String contentType,
  }) async {}
}
