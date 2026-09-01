with root_categories as (
  insert into public.ew_categories (code, name, description, sort_order)
  values
    ('attraction', 'Attractions', 'Places visited for sightseeing, culture, learning, or memorable local experiences.', 50)
  on conflict (code) do update
  set
    name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    is_active = true
  returning id, code
),
all_parents as (
  select id, code
  from public.ew_categories
  where code in ('food', 'activity', 'entertainment', 'outdoor')
  union all
  select id, code
  from root_categories
)
insert into public.ew_categories (parent_id, code, name, description, sort_order)
select all_parents.id, child.code, child.name, child.description, child.sort_order
from all_parents
join (
  values
    ('food', 'food.bakery', 'Bakeries', 'Bakeries and places primarily offering baked goods.', 30),
    ('food', 'food.dessert', 'Desserts', 'Dessert-focused shops and venues.', 40),
    ('activity', 'activity.recreation', 'Recreation', 'Participatory leisure and recreation venues.', 10),
    ('entertainment', 'entertainment.cinema', 'Cinemas', 'Movie theaters and cinemas.', 10),
    ('outdoor', 'outdoor.park', 'Parks and Gardens', 'Public parks, gardens, and similar outdoor discovery places.', 10),
    ('attraction', 'attraction.museum', 'Museums', 'Museums and their specialized subtypes.', 10),
    ('attraction', 'attraction.culture', 'Culture and Heritage', 'Galleries, heritage sites, monuments, and cultural attractions.', 20)
) as child(parent_code, code, name, description, sort_order)
  on child.parent_code = all_parents.code
on conflict (code) do update
set
  parent_id = excluded.parent_id,
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = true;
