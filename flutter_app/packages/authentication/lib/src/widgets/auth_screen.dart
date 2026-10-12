import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lamsa_design_system/lamsa_design_system.dart';
import 'package:lamsa_localization/lamsa_localization.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

import '../models.dart';
import '../session_manager.dart';

enum _AuthMode {
  login,
  registerPhone,
  registerDetails,
  recoveryPhone,
  recoveryDetails,
}

class LamsaAuthScreen extends StatefulWidget {
  const LamsaAuthScreen({
    required this.manager,
    required this.audienceLabel,
    super.key,
    this.accent = LamsaColors.plum,
    this.initialMessage,
  });

  final SessionManager manager;
  final String audienceLabel;
  final Color accent;
  final String? initialMessage;

  @override
  State<LamsaAuthScreen> createState() => _LamsaAuthScreenState();
}

class _LamsaAuthScreenState extends State<LamsaAuthScreen> {
  final _formKey = GlobalKey<FormState>();
  final _phone = TextEditingController();
  final _password = TextEditingController();
  final _name = TextEditingController();
  final _otp = TextEditingController();
  _AuthMode _mode = _AuthMode.login;
  OtpChallenge? _challenge;
  bool _busy = false;
  bool _hidePassword = true;
  String? _error;
  String? _success;
  Map<String, List<String>> _fieldErrors = const {};

  @override
  void initState() {
    super.initState();
    _error = widget.initialMessage;
  }

  @override
  void dispose() {
    _phone.dispose();
    _password.dispose();
    _name.dispose();
    _otp.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final strings = context.lamsa;
    final isLogin = _mode == _AuthMode.login;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(LamsaSpacing.lg),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 460),
              child: AutofillGroup(
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Align(
                        child: LamsaBrandMark(
                          size: 76,
                          foreground: widget.accent,
                        ),
                      ),
                      const SizedBox(height: LamsaSpacing.md),
                      Text(
                        isLogin ? strings.welcomeBack : _title(strings),
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      const SizedBox(height: LamsaSpacing.xs),
                      Text(
                        widget.audienceLabel,
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                      const SizedBox(height: LamsaSpacing.xl),
                      LamsaCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            if (_success != null) ...[
                              _Notice(
                                text: _success!,
                                color: LamsaColors.success,
                              ),
                              const SizedBox(height: LamsaSpacing.md),
                            ],
                            if (_error != null) ...[
                              _Notice(text: _error!, color: LamsaColors.danger),
                              const SizedBox(height: LamsaSpacing.md),
                            ],
                            ..._fields(strings),
                            const SizedBox(height: LamsaSpacing.lg),
                            LamsaButton(
                              label: _actionLabel(strings),
                              loading: _busy,
                              onPressed: _busy ? null : _submit,
                            ),
                            const SizedBox(height: LamsaSpacing.sm),
                            if (isLogin)
                              TextButton(
                                onPressed: _busy
                                    ? null
                                    : () => _switch(_AuthMode.recoveryPhone),
                                child: Text(strings.forgotPassword),
                              ),
                            TextButton(
                              onPressed: _busy
                                  ? null
                                  : () => _switch(
                                      isLogin
                                          ? _AuthMode.registerPhone
                                          : _AuthMode.login,
                                    ),
                              child: Text(
                                isLogin
                                    ? strings.createAccount
                                    : strings.backToLogin,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  String _title(LamsaLocalizations strings) => switch (_mode) {
    _AuthMode.registerPhone ||
    _AuthMode.registerDetails => strings.createAccount,
    _AuthMode.recoveryPhone ||
    _AuthMode.recoveryDetails => strings.resetPassword,
    _AuthMode.login => strings.login,
  };

  List<Widget> _fields(LamsaLocalizations strings) {
    final widgets = <Widget>[];
    if (_mode == _AuthMode.login ||
        _mode == _AuthMode.registerPhone ||
        _mode == _AuthMode.recoveryPhone) {
      widgets.add(
        LamsaTextField(
          label: strings.phone,
          controller: _phone,
          keyboardType: TextInputType.phone,
          textInputAction: _mode == _AuthMode.login
              ? TextInputAction.next
              : TextInputAction.done,
          autofillHints: const [AutofillHints.telephoneNumber],
          prefixIcon: Icons.phone_outlined,
          errorText: _serverError('phone'),
          validator: _validatePhone,
          inputFormatters: [
            FilteringTextInputFormatter.allow(RegExp(r'[0-9+]')),
          ],
        ),
      );
    }
    if (_mode == _AuthMode.login) {
      widgets.addAll([
        const SizedBox(height: LamsaSpacing.md),
        _passwordField(strings.password),
      ]);
    }
    if (_mode == _AuthMode.registerDetails) {
      widgets.addAll([
        LamsaTextField(
          label: strings.name,
          controller: _name,
          textInputAction: TextInputAction.next,
          autofillHints: const [AutofillHints.name],
          prefixIcon: Icons.person_outline,
          errorText: _serverError('name'),
          validator: (value) =>
              (value?.trim().length ?? 0) < 2 ? strings.invalidName : null,
        ),
        const SizedBox(height: LamsaSpacing.md),
        _otpField(strings),
        const SizedBox(height: LamsaSpacing.md),
        _passwordField(strings.password),
        if (_challenge?.isDemo ?? false) ...[
          const SizedBox(height: LamsaSpacing.sm),
          Text(
            strings.demoOtpHint,
            style: const TextStyle(color: LamsaColors.warning),
          ),
        ],
      ]);
    }
    if (_mode == _AuthMode.recoveryDetails) {
      widgets.addAll([
        _otpField(strings),
        const SizedBox(height: LamsaSpacing.md),
        _passwordField(strings.newPassword),
        if (_challenge?.isDemo ?? false) ...[
          const SizedBox(height: LamsaSpacing.sm),
          Text(
            strings.demoOtpHint,
            style: const TextStyle(color: LamsaColors.warning),
          ),
        ],
      ]);
    }
    return widgets;
  }

  Widget _otpField(LamsaLocalizations strings) => LamsaTextField(
    label: strings.verificationCode,
    controller: _otp,
    keyboardType: TextInputType.number,
    textInputAction: TextInputAction.next,
    prefixIcon: Icons.verified_outlined,
    errorText: _serverError('otp'),
    validator: (value) =>
        RegExp(r'^\d{6}$').hasMatch(value ?? '') ? null : strings.invalidOtp,
    inputFormatters: [
      FilteringTextInputFormatter.digitsOnly,
      LengthLimitingTextInputFormatter(6),
    ],
  );

  Widget _passwordField(String label) => LamsaTextField(
    label: label,
    controller: _password,
    obscureText: _hidePassword,
    textInputAction: TextInputAction.done,
    autofillHints: _mode == _AuthMode.login
        ? const [AutofillHints.password]
        : const [AutofillHints.newPassword],
    prefixIcon: Icons.lock_outline,
    suffixIcon: IconButton(
      tooltip: _hidePassword ? 'إظهار كلمة المرور' : 'إخفاء كلمة المرور',
      onPressed: () => setState(() => _hidePassword = !_hidePassword),
      icon: Icon(
        _hidePassword
            ? Icons.visibility_outlined
            : Icons.visibility_off_outlined,
      ),
    ),
    errorText: _serverError(
      _mode == _AuthMode.recoveryDetails ? 'newPassword' : 'password',
    ),
    validator: (value) {
      if (_mode == _AuthMode.login) {
        return (value?.isEmpty ?? true) ? context.lamsa.requiredField : null;
      }
      return (value?.length ?? 0) < 12 ? context.lamsa.passwordLength : null;
    },
    onSubmitted: (_) => _submit(),
  );

  String _actionLabel(LamsaLocalizations strings) => switch (_mode) {
    _AuthMode.login => strings.login,
    _AuthMode.registerPhone || _AuthMode.recoveryPhone => strings.continueLabel,
    _AuthMode.registerDetails => strings.verifyAndCreate,
    _AuthMode.recoveryDetails => strings.confirmReset,
  };

  String? _serverError(String field) => _fieldErrors[field]?.firstOrNull;

  String? _validatePhone(String? value) {
    final phone = value?.trim() ?? '';
    final egyptian = RegExp(r'^(01[0125]\d{8}|\+201[0125]\d{8})$');
    final legacySaudi = RegExp(r'^(05\d{8}|\+9665\d{8})$');
    final valid =
        egyptian.hasMatch(phone) ||
        (_mode == _AuthMode.login && legacySaudi.hasMatch(phone));
    return valid ? null : context.lamsa.invalidPhone;
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _busy = true;
      _error = null;
      _success = null;
      _fieldErrors = const {};
    });
    try {
      switch (_mode) {
        case _AuthMode.login:
          await widget.manager.login(
            phone: _phone.text.trim(),
            password: _password.text,
          );
        case _AuthMode.registerPhone:
          final challenge = await widget.manager.requestRegistrationOtp(
            _phone.text.trim(),
          );
          if (!mounted) return;
          setState(() {
            _challenge = challenge;
            _mode = _AuthMode.registerDetails;
          });
        case _AuthMode.registerDetails:
          await widget.manager.register(
            phone: _phone.text.trim(),
            challengeId: _challenge!.id,
            otp: _otp.text,
            name: _name.text.trim(),
            password: _password.text,
          );
        case _AuthMode.recoveryPhone:
          final challenge = await widget.manager.requestPasswordOtp(
            _phone.text.trim(),
          );
          if (!mounted) return;
          setState(() {
            _challenge = challenge;
            _mode = _AuthMode.recoveryDetails;
          });
        case _AuthMode.recoveryDetails:
          await widget.manager.resetPassword(
            phone: _phone.text.trim(),
            challengeId: _challenge!.id,
            otp: _otp.text,
            newPassword: _password.text,
          );
          if (!mounted) return;
          _switch(_AuthMode.login);
          setState(() => _success = context.lamsa.passwordResetDone);
      }
    } on ApiFailure catch (failure) {
      if (!mounted) return;
      setState(() {
        _error = failure.message;
        _fieldErrors = failure.fields;
      });
    } on Object {
      if (!mounted) return;
      setState(() => _error = 'تعذر إكمال العملية');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _switch(_AuthMode mode) {
    setState(() {
      _mode = mode;
      _challenge = null;
      _otp.clear();
      _password.clear();
      _name.clear();
      _error = null;
      _success = null;
      _fieldErrors = const {};
    });
  }
}

class _Notice extends StatelessWidget {
  const _Notice({required this.text, required this.color});

  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withValues(alpha: 0.25)),
        ),
        child: Padding(
          padding: const EdgeInsets.all(LamsaSpacing.sm),
          child: Text(text, style: TextStyle(color: color)),
        ),
      ),
    );
  }
}
