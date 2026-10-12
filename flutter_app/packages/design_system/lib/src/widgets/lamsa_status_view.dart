import 'package:flutter/material.dart';

import '../foundation/lamsa_colors.dart';
import 'lamsa_button.dart';

enum LamsaStatus { loading, empty, error, offline, forbidden }

class LamsaStatusView extends StatelessWidget {
  const LamsaStatusView({
    required this.status,
    required this.title,
    required this.message,
    super.key,
    this.onRetry,
  });

  final LamsaStatus status;
  final String title;
  final String message;
  final VoidCallback? onRetry;

  IconData get _icon => switch (status) {
    LamsaStatus.empty => Icons.inbox_outlined,
    LamsaStatus.error => Icons.error_outline_rounded,
    LamsaStatus.offline => Icons.wifi_off_rounded,
    LamsaStatus.forbidden => Icons.lock_outline_rounded,
    LamsaStatus.loading => Icons.hourglass_empty_rounded,
  };

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 360),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (status == LamsaStatus.loading)
                  const CircularProgressIndicator()
                else
                  DecoratedBox(
                    decoration: const BoxDecoration(
                      color: LamsaColors.blush,
                      shape: BoxShape.circle,
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(18),
                      child: Icon(_icon, size: 34, color: LamsaColors.plum),
                    ),
                  ),
                const SizedBox(height: 22),
                Text(
                  title,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 8),
                Text(
                  message,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                if (onRetry != null) ...[
                  const SizedBox(height: 24),
                  SizedBox(
                    width: 180,
                    child: LamsaButton(
                      label: 'إعادة المحاولة',
                      onPressed: onRetry,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
