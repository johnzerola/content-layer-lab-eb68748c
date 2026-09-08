"""Conservative review signals, not a claim of ground-truth image quality."""
import math


def review_issues(metrics, verified=True):
    if not verified:
        return ["verificacao_desativada"]
    limits = (("residual_text", 0.05, "texto_residual", True),
              ("sharpness_ratio", 0.25, "possivel_borrado", False),
              ("temporal_consistency", 0.6, "instabilidade_temporal", False))
    issues = []
    for key, limit, issue, maximum in limits:
        try:
            value = float(metrics[key])
        except (KeyError, TypeError, ValueError):
            issues.append("metricas_incompletas")
            continue
        if not math.isfinite(value):
            issues.append("metricas_incompletas")
        elif (value > limit if maximum else value < limit):
            issues.append(issue)
    return list(dict.fromkeys(issues))


def should_try_alternative(metrics):
    issues = review_issues(metrics)
    # OCR residual calls for mask correction, not more diffusion on bad masks.
    return bool(issues) and all(issue in ("possivel_borrado", "instabilidade_temporal") for issue in issues)


def prefer_alternative(primary, candidate):
    if review_issues(candidate):
        return False
    # Require improvement without trading away another measured dimension.
    return (candidate["residual_text"] <= primary["residual_text"]
            and candidate["sharpness_ratio"] >= primary["sharpness_ratio"]
            and candidate["temporal_consistency"] >= primary["temporal_consistency"]
            and (candidate["sharpness_ratio"] > primary["sharpness_ratio"]
                 or candidate["temporal_consistency"] > primary["temporal_consistency"]))
