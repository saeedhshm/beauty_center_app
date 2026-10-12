import 'package:flutter/material.dart';
import 'package:lamsa_design_system/lamsa_design_system.dart';
import 'package:lamsa_localization/lamsa_localization.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

import '../auth_api.dart';
import '../session_manager.dart';

class LamsaAccountScreen extends StatefulWidget {
  const LamsaAccountScreen({
    required this.manager,
    required this.api,
    required this.title,
    super.key,
  });

  final SessionManager manager;
  final AccountGateway api;
  final String title;

  @override
  State<LamsaAccountScreen> createState() => _LamsaAccountScreenState();
}

class _LamsaAccountScreenState extends State<LamsaAccountScreen>
    with WidgetsBindingObserver {
  late final TextEditingController _name;
  bool _saving = false;
  bool _loggingOut = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _name = TextEditingController(text: widget.manager.user?.name ?? '');
    _refreshAccount();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _name.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _refreshAccount();
  }

  @override
  Widget build(BuildContext context) {
    final user = widget.manager.user!;
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(LamsaSpacing.lg),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 620),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    context.lamsa.profile,
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: LamsaSpacing.lg),
                  LamsaCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (_error != null) ...[
                          Text(
                            _error!,
                            style: const TextStyle(color: LamsaColors.danger),
                          ),
                          const SizedBox(height: LamsaSpacing.md),
                        ],
                        LamsaTextField(
                          label: context.lamsa.name,
                          controller: _name,
                          prefixIcon: Icons.person_outline,
                        ),
                        const SizedBox(height: LamsaSpacing.md),
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: const Icon(Icons.phone_outlined),
                          title: Text(context.lamsa.phone),
                          subtitle: Directionality(
                            textDirection: TextDirection.ltr,
                            child: Text(user.phone, textAlign: TextAlign.end),
                          ),
                        ),
                        const SizedBox(height: LamsaSpacing.lg),
                        LamsaButton(
                          label: context.lamsa.save,
                          loading: _saving,
                          onPressed: _saving ? null : _save,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: LamsaSpacing.md),
                  LamsaButton(
                    label: context.lamsa.logout,
                    outlined: true,
                    loading: _loggingOut,
                    onPressed: _loggingOut ? null : _logout,
                    icon: Icons.logout,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _save() async {
    final value = _name.text.trim();
    if (value.length < 2) {
      setState(() => _error = context.lamsa.invalidName);
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final user = await widget.api.updateName(value);
      widget.manager.replaceUser(user);
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(context.lamsa.profileUpdated)));
      }
    } on ApiFailure catch (failure) {
      if (mounted) setState(() => _error = failure.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _refreshAccount() async {
    try {
      final user = await widget.api.currentUser();
      widget.manager.replaceUser(user);
      if (mounted) _name.text = user.name;
    } on ApiFailure catch (failure) {
      if (mounted && failure.kind != ApiFailureKind.unauthorized) {
        setState(() => _error = failure.message);
      }
    }
  }

  Future<void> _logout() async {
    setState(() => _loggingOut = true);
    await widget.manager.logout();
    if (mounted) setState(() => _loggingOut = false);
  }
}
