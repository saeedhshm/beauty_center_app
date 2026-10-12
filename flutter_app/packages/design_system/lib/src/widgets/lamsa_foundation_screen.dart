import 'package:flutter/material.dart';

import '../foundation/lamsa_colors.dart';
import '../foundation/lamsa_spacing.dart';
import 'lamsa_brand_mark.dart';
import 'lamsa_card.dart';

class LamsaFoundationScreen extends StatelessWidget {
  const LamsaFoundationScreen({
    required this.audienceLabel,
    required this.title,
    required this.message,
    required this.items,
    required this.environmentLabel,
    super.key,
    this.accent = LamsaColors.plum,
  });

  final String audienceLabel;
  final String title;
  final String message;
  final List<String> items;
  final String environmentLabel;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final horizontal = constraints.maxWidth >= 760;
            final intro = _Intro(
              audienceLabel: audienceLabel,
              title: title,
              message: message,
              environmentLabel: environmentLabel,
              accent: accent,
            );
            final status = _FoundationStatus(items: items, accent: accent);
            return SingleChildScrollView(
              padding: EdgeInsets.symmetric(
                horizontal: horizontal ? LamsaSpacing.xxl : LamsaSpacing.lg,
                vertical: horizontal ? LamsaSpacing.xxl : LamsaSpacing.xl,
              ),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 980),
                  child: horizontal
                      ? Row(
                          crossAxisAlignment: CrossAxisAlignment.center,
                          children: [
                            Expanded(flex: 6, child: intro),
                            const SizedBox(width: 40),
                            Expanded(flex: 5, child: status),
                          ],
                        )
                      : Column(
                          children: [intro, const SizedBox(height: 30), status],
                        ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _Intro extends StatelessWidget {
  const _Intro({
    required this.audienceLabel,
    required this.title,
    required this.message,
    required this.environmentLabel,
    required this.accent,
  });

  final String audienceLabel;
  final String title;
  final String message;
  final String environmentLabel;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        PositionedDirectional(
          top: -70,
          start: -50,
          child: Container(
            width: 180,
            height: 180,
            decoration: BoxDecoration(
              color: LamsaColors.blush.withValues(alpha: .55),
              shape: BoxShape.circle,
            ),
          ),
        ),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const LamsaBrandMark(),
            const SizedBox(height: 30),
            Row(
              children: [
                _Pill(label: audienceLabel, color: accent),
                const SizedBox(width: 8),
                _Pill(label: environmentLabel, color: LamsaColors.muted),
              ],
            ),
            const SizedBox(height: 20),
            Text(title, style: Theme.of(context).textTheme.displaySmall),
            const SizedBox(height: 14),
            Text(message, style: Theme.of(context).textTheme.bodyLarge),
          ],
        ),
      ],
    );
  }
}

class _FoundationStatus extends StatelessWidget {
  const _FoundationStatus({required this.items, required this.accent});

  final List<String> items;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return LamsaCard(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'أساس التطبيق جاهز',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 6),
          Text(
            'لا تعرض هذه المرحلة بيانات تجارية أو تكاملًا وهميًا.',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: 24),
          for (final item in items)
            Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: Row(
                children: [
                  Container(
                    width: 28,
                    height: 28,
                    decoration: BoxDecoration(
                      color: accent.withValues(alpha: .1),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(Icons.check_rounded, color: accent, size: 18),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      item,
                      style: Theme.of(context).textTheme.bodyLarge,
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 8),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: LamsaColors.canvas,
              borderRadius: BorderRadius.circular(14),
            ),
            child: const Text(
              'تسجيل الدخول والرحلات التشغيلية تبدأ في المراحل التالية.',
              textAlign: TextAlign.center,
            ),
          ),
        ],
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: color.withValues(alpha: .09),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        child: Text(
          label,
          style: TextStyle(
            color: color,
            fontWeight: FontWeight.w700,
            fontSize: 12,
          ),
        ),
      ),
    );
  }
}
