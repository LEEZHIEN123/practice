"""
Train the water intake Gradient Boosting model (aligned with untitled6.py)
and export a compact JSON for on-device inference in the app.

Source training notebook: untitled6.py / Colab
Dataset: advanced_water_dataset.csv

Run: python scripts/export_water_model.py
"""

from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import KFold, cross_validate, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

ROOT = Path(__file__).resolve().parents[1]
DATASET_CANDIDATES = [
    Path(r"c:\Users\leezh\Downloads\advanced_water_dataset.csv"),
    ROOT / "data" / "advanced_water_dataset.csv",
    ROOT / "scripts" / "advanced_water_dataset.csv",
]
OUT_JSON = ROOT / "lib" / "waterIntakeModel.json"
OUT_PKL = ROOT / "assets" / "models" / "water_intake_gradient_boosting.pkl"
OUT_RESULTS = ROOT / "assets" / "models" / "gradient_boosting_results.csv"

FEATURE_COLUMNS = [
    "age",
    "weight",
    "height",
    "gender",
    "BMI",
    "temperature",
    "humidity",
    "weather_condition",
    "altitude",
    "activity_level",
    "activity_duration",
]

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

CATEGORICAL_FEATURES = [
    "gender",
    "weather_condition",
    "activity_level",
]

TARGET = "water_intake"


def resolve_dataset() -> Path:
    for path in DATASET_CANDIDATES:
        if path.exists():
            return path
    raise SystemExit(
        "Dataset not found. Expected advanced_water_dataset.csv in Downloads or data/."
    )


def export_tree(tree) -> dict:
    t = tree.tree_
    return {
        "children_left": t.children_left.tolist(),
        "children_right": t.children_right.tolist(),
        "feature": t.feature.tolist(),
        "threshold": t.threshold.tolist(),
        "value": t.value.reshape(-1).tolist(),
    }


def build_pipeline() -> Pipeline:
    numerical_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
        ]
    )
    categorical_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            (
                "onehot",
                OneHotEncoder(handle_unknown="ignore", sparse_output=False),
            ),
        ]
    )
    preprocessor = ColumnTransformer(
        transformers=[
            ("numerical", numerical_pipeline, NUMERICAL_FEATURES),
            ("categorical", categorical_pipeline, CATEGORICAL_FEATURES),
        ]
    )
    gradient_boosting_model = GradientBoostingRegressor(
        n_estimators=150,
        learning_rate=0.05,
        max_depth=3,
        min_samples_split=2,
        min_samples_leaf=1,
        subsample=1.0,
        random_state=42,
    )
    return Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            ("model", gradient_boosting_model),
        ]
    )


def main() -> None:
    dataset = resolve_dataset()
    df = pd.read_csv(dataset)

    missing_columns = [
        column
        for column in FEATURE_COLUMNS + [TARGET]
        if column not in df.columns
    ]
    if missing_columns:
        raise SystemExit(f"Missing columns in dataset: {missing_columns}")

    X = df[FEATURE_COLUMNS].copy()
    y = df[TARGET].copy()

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42
    )
    print(f"Read {dataset}")
    print(f"Training records: {len(X_train)}")
    print(f"Testing records: {len(X_test)}")

    model_pipeline = build_pipeline()

    five_fold_cv = KFold(n_splits=5, shuffle=True, random_state=42)
    scoring_metrics = {
        "r2": "r2",
        "mae": "neg_mean_absolute_error",
        "rmse": "neg_root_mean_squared_error",
    }
    cv_results = cross_validate(
        estimator=model_pipeline,
        X=X_train,
        y=y_train,
        cv=five_fold_cv,
        scoring=scoring_metrics,
        n_jobs=-1,
        return_train_score=False,
    )
    cv_r2_scores = cv_results["test_r2"]
    cv_mae_scores = -cv_results["test_mae"]
    cv_rmse_scores = -cv_results["test_rmse"]

    model_pipeline.fit(X_train, y_train)
    training_predictions = model_pipeline.predict(X_train)
    testing_predictions = model_pipeline.predict(X_test)

    training_r2 = r2_score(y_train, training_predictions)
    testing_r2 = r2_score(y_test, testing_predictions)
    test_mae = mean_absolute_error(y_test, testing_predictions)
    test_rmse = float(np.sqrt(mean_squared_error(y_test, testing_predictions)))
    r2_gap = training_r2 - testing_r2

    print("\n" + "=" * 60)
    print("GRADIENT BOOSTING REGRESSION RESULTS")
    print("=" * 60)
    print(f"Training R²:             {training_r2:.6f}")
    print(f"Testing R²:              {testing_r2:.6f}")
    print(f"Training–Testing R² Gap: {r2_gap:.6f}")
    print(f"Test MAE:                {test_mae:.6f}")
    print(f"Test RMSE:               {test_rmse:.6f}")

    print("\n" + "=" * 60)
    print("5-FOLD CROSS-VALIDATION RESULTS")
    print("=" * 60)
    for fold_number, score in enumerate(cv_r2_scores, start=1):
        print(f"Fold {fold_number} R²: {score:.6f}")
    print(f"\n5-Fold CV Mean R²:       {cv_r2_scores.mean():.6f}")
    print(f"5-Fold CV R² Std:        {cv_r2_scores.std():.6f}")
    print(f"5-Fold CV Mean MAE:      {cv_mae_scores.mean():.6f}")
    print(f"5-Fold CV Mean RMSE:     {cv_rmse_scores.mean():.6f}")

    results = pd.DataFrame(
        {
            "Metric": [
                "Training R2",
                "Testing R2",
                "R2 Gap",
                "Test MAE",
                "Test RMSE",
                "5-Fold CV Mean R2",
                "5-Fold CV R2 Standard Deviation",
                "5-Fold CV Mean MAE",
                "5-Fold CV Mean RMSE",
            ],
            "Value": [
                training_r2,
                testing_r2,
                r2_gap,
                test_mae,
                test_rmse,
                float(cv_r2_scores.mean()),
                float(cv_r2_scores.std()),
                float(cv_mae_scores.mean()),
                float(cv_rmse_scores.mean()),
            ],
        }
    )
    OUT_RESULTS.parent.mkdir(parents=True, exist_ok=True)
    results.to_csv(OUT_RESULTS, index=False)
    print(f"\nWrote {OUT_RESULTS}")

    # Export compact JSON for TypeScript walker (same feature order as TS).
    prep: ColumnTransformer = model_pipeline.named_steps["preprocessor"]
    reg: GradientBoostingRegressor = model_pipeline.named_steps["model"]

    num_imputer: SimpleImputer = prep.named_transformers_["numerical"].named_steps[
        "imputer"
    ]
    cat_encoder: OneHotEncoder = prep.named_transformers_["categorical"].named_steps[
        "onehot"
    ]

    cat_feature_names: list[str] = []
    for feature, categories in zip(CATEGORICAL_FEATURES, cat_encoder.categories_):
        for category in categories:
            cat_feature_names.append(f"{feature}__{category}")

    init_value = float(np.asarray(reg.init_.constant_).reshape(-1)[0])

    payload = {
        "version": 2,
        "targetUnit": "liters",
        "nEstimators": reg.n_estimators,
        "learningRate": reg.learning_rate,
        "maxDepth": reg.max_depth,
        "numericalFeatures": NUMERICAL_FEATURES,
        "categoricalFeatures": CATEGORICAL_FEATURES,
        "numMedians": num_imputer.statistics_.tolist(),
        "catCategories": [c.tolist() for c in cat_encoder.categories_],
        "catFeatureNames": cat_feature_names,
        "init": init_value,
        "metrics": {
            "trainingR2": training_r2,
            "testingR2": testing_r2,
            "r2Gap": r2_gap,
            "testMae": test_mae,
            "testRmse": test_rmse,
            "cvMeanR2": float(cv_r2_scores.mean()),
            "cvStdR2": float(cv_r2_scores.std()),
            "cvMeanMae": float(cv_mae_scores.mean()),
            "cvMeanRmse": float(cv_rmse_scores.mean()),
        },
        "trees": [export_tree(est[0]) for est in reg.estimators_],
    }

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(payload), encoding="utf-8")
    print(f"Wrote {OUT_JSON} ({len(payload['trees'])} trees)")

    OUT_PKL.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model_pipeline, OUT_PKL)
    print(f"Wrote {OUT_PKL}")


if __name__ == "__main__":
    main()
