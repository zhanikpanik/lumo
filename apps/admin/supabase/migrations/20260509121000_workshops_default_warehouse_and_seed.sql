-- Workshop default warehouse mapping for POS auto write-off.
-- Also seeds default workshops/warehouses for newly created venues.

ALTER TABLE public.workshops
  ADD COLUMN IF NOT EXISTS default_warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workshops_default_warehouse_id
  ON public.workshops(default_warehouse_id);

DO $$
BEGIN
  IF to_regclass('public.workshop_warehouses') IS NOT NULL THEN
    UPDATE public.workshops w
    SET default_warehouse_id = m.warehouse_id
    FROM (
      SELECT DISTINCT ON (ww.workshop_id)
        ww.workshop_id,
        ww.warehouse_id
      FROM public.workshop_warehouses ww
      ORDER BY ww.workshop_id, ww.warehouse_id
    ) m
    WHERE w.id = m.workshop_id
      AND w.default_warehouse_id IS NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.seed_default_ops_structure(p_venue_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wh_kitchen UUID;
  v_wh_bar UUID;
  v_ws_kitchen UUID;
  v_ws_bar UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM public.workshops w WHERE w.venue_id = p_venue_id) THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.warehouses wh WHERE wh.venue_id = p_venue_id) THEN
    RETURN;
  END IF;

  INSERT INTO public.warehouses (venue_id, name)
  VALUES (p_venue_id, 'Кухня')
  RETURNING id INTO v_wh_kitchen;

  INSERT INTO public.warehouses (venue_id, name)
  VALUES (p_venue_id, 'Бар')
  RETURNING id INTO v_wh_bar;

  INSERT INTO public.workshops (venue_id, name, default_warehouse_id)
  VALUES (p_venue_id, 'Кухня', v_wh_kitchen)
  RETURNING id INTO v_ws_kitchen;

  INSERT INTO public.workshops (venue_id, name, default_warehouse_id)
  VALUES (p_venue_id, 'Бар', v_wh_bar)
  RETURNING id INTO v_ws_bar;

  IF to_regclass('public.workshop_warehouses') IS NOT NULL THEN
    INSERT INTO public.workshop_warehouses (workshop_id, warehouse_id)
    SELECT v_ws_kitchen, v_wh_kitchen
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.workshop_warehouses ww
      WHERE ww.workshop_id = v_ws_kitchen
        AND ww.warehouse_id = v_wh_kitchen
    );

    INSERT INTO public.workshop_warehouses (workshop_id, warehouse_id)
    SELECT v_ws_bar, v_wh_bar
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.workshop_warehouses ww
      WHERE ww.workshop_id = v_ws_bar
        AND ww.warehouse_id = v_wh_bar
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_seed_default_ops_after_venue_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_default_ops_structure(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_venue_insert_seed_default_ops ON public.venues;
CREATE TRIGGER after_venue_insert_seed_default_ops
AFTER INSERT ON public.venues
FOR EACH ROW
EXECUTE FUNCTION public.trg_seed_default_ops_after_venue_insert();
