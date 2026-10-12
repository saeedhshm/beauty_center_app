import 'package:flutter/material.dart';
import 'package:lamsa_design_system/lamsa_design_system.dart';
import 'package:lamsa_localization/lamsa_localization.dart';

import '../session_manager.dart';

class SessionBootstrapScreen extends StatelessWidget {
  const SessionBootstrapScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: LamsaStatusView(
        status: LamsaStatus.loading,
        title: context.lamsa.appName,
        message: context.lamsa.loadingSession,
      ),
    );
  }
}

class OfflineSessionScreen extends StatelessWidget {
  const OfflineSessionScreen({required this.manager, super.key});

  final SessionManager manager;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(LamsaSpacing.lg),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(
                children: [
                  LamsaStatusView(
                    status: LamsaStatus.offline,
                    title: context.lamsa.offlineRestoreTitle,
                    message: context.lamsa.offlineRestoreMessage,
                    onRetry: manager.bootstrap,
                  ),
                  TextButton(
                    onPressed: manager.discardStoredSession,
                    child: Text(context.lamsa.useAnotherAccount),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
