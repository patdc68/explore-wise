with root_categories as (
  insert into public.ew_categories (code, name, sort_order)
  values
    ('food', 'Food', 10),
    ('activity', 'Activity', 20),
    ('entertainment', 'Entertainment', 30),
    ('outdoor', 'Outdoor', 40)
  on conflict (code) do update
  set
    name = excluded.name,
    sort_order = excluded.sort_order,
    is_active = true
  returning id, code
)
insert into public.ew_categories (parent_id, code, name, sort_order)
select root_categories.id, child.code, child.name, child.sort_order
from root_categories
join (
  values
    ('food', 'food.restaurant', 'Restaurants', 10),
    ('food', 'food.cafe', 'Cafes', 20)
) as child(parent_code, code, name, sort_order)
  on child.parent_code = root_categories.code
on conflict (code) do update
set
  parent_id = excluded.parent_id,
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_active = true;
