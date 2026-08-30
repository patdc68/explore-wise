revoke truncate, references, trigger on table
  public.ew_categories,
  public.ew_places,
  public.ew_tags,
  public.ew_place_tags,
  public.ew_place_prices,
  public.ew_profiles,
  public.ew_user_preferences,
  public.ew_favorites
from service_role;

grant select, insert, update, delete on table
  public.ew_categories,
  public.ew_places,
  public.ew_tags,
  public.ew_place_tags,
  public.ew_place_prices,
  public.ew_profiles,
  public.ew_user_preferences,
  public.ew_favorites
to service_role;
