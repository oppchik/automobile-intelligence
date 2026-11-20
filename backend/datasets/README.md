# Подготовка объявлений

В репозитории не было исходного пула объявлений, поэтому реальные рыночные данные не подменяются вымышленными. Для подготовки датасета передайте CSV или JSON со столбцами `source, source_id, brand, model, year, mileage, region, price` (необязательный `condition`).

```bash
python backend/datasets/prepare_listings.py listings.csv backend/datasets/listings_clean.json
```

Скрипт нормализует поля через существующий `market_algorithms.normalize_listing`, удаляет некорректные и повторные записи по `(source, source_id)`. Файл результата подходит для `estimate_from_listings`. Для устойчивой оценки необходимо хотя бы 3 сопоставимых объявления; для статуса `ok` — 7 после фильтрации.
