"""Train the water intake model and export a compact JSON for on-device inference."""

from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

ROOT = Path(__file__).resolve().parents[1]
DATASET = Path(r"c:\Users\leezh\Downloads\advanced_water_dataset.csv")
OUT_JSON = ROOT / "lib" / "waterIntakeModel.json"
OUT_PKL = ROOT / "assets" / "models" / "water_intake_gradient_boosting.pkl"

CATEGORICAL_FEATURES = ["gender", "weather_condition", "activity_level"]
NUMERICAL_FEATURES = [
    "age",
    "weight",
    "height",
    "BMI",
    "temperature",
    "humidity",
    "altitude",
    "activity_duration",
]
TARGET = "water_intake"


def export_tree(tree) -> dict:
    t = tree.tree_
    return {
        "children_left": t.children_left.tolist(),
        "children_right": t.children_right.tolist(),
        "feature": t.feature.tolist(),
        "threshold": t.threshold.tolist(),
        "value": t.value.reshape(-1).tolist(),
    }


def main() -> None:
    if not DATASET.exists():
        raise SystemExit(f"Dataset not found: {DATASET}")

    df = pd.read_csv(DATASET)
    X = df[CATEGORICAL_FEATURES + NUMERICAL_FEATURES]
    y = df[TARGET]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    preprocessor = ColumnTransformer(
        transformers=[
            ("num", SimpleImputer(strategy="median"), NUMERICAL_FEATURES),
            ("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL_FEATURES),
        ]
    )

    model = Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            (
                "regressor",
                GradientBoostingRegressor(
                    n_estimators=100,
                    learning_rate=0.1,
                    max_depth=3,
                    random_state=42,
                ),
            ),
        ]
    )

    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)
    print(f"R2: {r2_score(y_test, y_pred):.4f}")
    print(f"MAE: {mean_absolute_error(y_test, y_pred):.4f}")

    prep = model.named_steps["preprocessor"]
    reg = model.named_steps["regressor"]
    num_imputer: SimpleImputer = prep.named_transformers_["num"]
    cat_encoder: OneHotEncoder = prep.named_transformers_["cat"]

    cat_feature_names: list[str] = []
    for feature, categories in zip(CATEGORICAL_FEATURES, cat_encoder.categories_):
        for category in categories:
            cat_feature_names.append(f"{feature}__{category}")

    init_value = float(np.asarray(reg.init_.constant_).reshape(-1)[0])

    payload = {
        "version": 1,
        "targetUnit": "liters",
        "numericalFeatures": NUMERICAL_FEATURES,
        "categoricalFeatures": CATEGORICAL_FEATURES,
        "numMedians": num_imputer.statistics_.tolist(),
        "catCategories": [c.tolist() for c in cat_encoder.categories_],
        "catFeatureNames": cat_feature_names,
        "learningRate": reg.learning_rate,
        "init": init_value,
        "trees": [export_tree(est[0]) for est in reg.estimators_],
    }

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(payload), encoding="utf-8")
    print(f"Wrote {OUT_JSON}")

    OUT_PKL.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, OUT_PKL)
    print(f"Wrote {OUT_PKL}")


if __name__ == "__main__":
    main()
