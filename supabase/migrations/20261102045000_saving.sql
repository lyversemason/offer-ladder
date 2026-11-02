-- Saving in live mode (docs/accounts-plan.md, phase 4). Browsers can't write; the
-- server function (server/save.ts) checks who's asking and prices everything again
-- with the engine, then calls one of these to write it all in one transaction.
-- Only the server's key may run them (service_role); they run as the database
-- owner (SECURITY DEFINER), so they don't need the tables opened to anyone else.

-- One customer's outcome: the visit, the sale (if they bought) and its lines, and
-- every offer with its lines and reasons. The rows come from src/data/outcome.ts.
CREATE FUNCTION public.save_outcome(payload JSONB) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id BIGINT;
  d_id BIGINT;
  o JSONB;
  o_id BIGINT;
BEGIN
  INSERT INTO public.visits (rep_id, store_id, visited_on, sold, ticket_id)
  SELECT rep_id, store_id, visited_on, sold, ticket_id
  FROM jsonb_populate_record(NULL::public.visits, payload -> 'visit')
  RETURNING id INTO v_id;

  IF jsonb_typeof(payload -> 'deal') = 'object' THEN
    INSERT INTO public.deals (visit_id, rep_id, store_id, closed_on, list_topline_cents, topline_cents,
      product_cost_cents, delivery_cost_cents, gross_cents, margin_bp, tier_id, rate_bp, attach,
      commission_cents, financing_months, financing_adj_cents, delivery_tier_id, delivery_price_cents,
      tax_cents, offers_made, closed_at_rung)
    SELECT v_id, rep_id, store_id, closed_on, list_topline_cents, topline_cents,
      product_cost_cents, delivery_cost_cents, gross_cents, margin_bp, tier_id, rate_bp, attach,
      commission_cents, financing_months, financing_adj_cents, delivery_tier_id, delivery_price_cents,
      tax_cents, offers_made, closed_at_rung
    FROM jsonb_populate_record(NULL::public.deals, payload -> 'deal')
    RETURNING id INTO d_id;

    INSERT INTO public.deal_lines (deal_id, line_no, sku, condition, qty, list_cents, discount_cents, net_cents, cost_cents, locked)
    SELECT d_id, line_no, sku, condition, qty, list_cents, discount_cents, net_cents, cost_cents, locked
    FROM jsonb_populate_recordset(NULL::public.deal_lines, payload -> 'deal_lines');
  END IF;

  FOR o IN SELECT value FROM jsonb_array_elements(payload -> 'offers') LOOP
    INSERT INTO public.offers (visit_id, deal_id, step_no, topline_cents, margin_bp, tier_id, commission_cents,
      accepted, delivery_tier_id, delivery_list_cents, delivery_price_cents, financing_months)
    SELECT v_id, CASE WHEN accepted THEN d_id END, step_no, topline_cents, margin_bp, tier_id, commission_cents,
      accepted, delivery_tier_id, delivery_list_cents, delivery_price_cents, financing_months
    FROM jsonb_populate_record(NULL::public.offers, o)
    RETURNING id INTO o_id;

    INSERT INTO public.offer_lines (offer_id, line_no, sku, condition, qty, list_cents, discount_cents,
      net_cents, cost_cents, locked, discount_how, discount_scope)
    SELECT o_id, line_no, sku, condition, qty, list_cents, discount_cents,
      net_cents, cost_cents, locked, discount_how, discount_scope
    FROM jsonb_populate_recordset(NULL::public.offer_lines, o -> 'lines');

    INSERT INTO public.offer_reasons (offer_id, reason_no, reason)
    SELECT o_id, r.n, r.reason
    FROM jsonb_array_elements_text(o -> 'reasons') WITH ORDINALITY AS r (reason, n);
  END LOOP;

  RETURN jsonb_build_object('visit_id', v_id, 'deal_id', d_id);
END;
$$;

-- A new rule set (the whole set is kept, so a report can always use the rules of the day).
CREATE FUNCTION public.save_settings(settings JSONB) RETURNS BIGINT
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.settings_history (changed_on, settings_json) VALUES (now(), settings) RETURNING id
$$;

-- The catalog changes an admin approved in the import (the review list from step 5).
-- The statements are step 6 of the import exactly as written (src/import/steps/
-- 6-apply.sql; a test checks they match), run against the approved list.
CREATE FUNCTION public.apply_catalog_changes(changes JSONB) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  n_changed INT;
  n_added INT;
BEGIN
  CREATE TEMP TABLE vendor_changes ON COMMIT DROP AS
  SELECT * FROM jsonb_to_recordset(changes) AS c (
    sku TEXT, model_sku TEXT, brand TEXT, model TEXT, category TEXT, size TEXT, change TEXT,
    new_list_cents INTEGER, new_cost_cents INTEGER, new_outlet_cost_cents INTEGER);
  SELECT COUNT(*) FILTER (WHERE change = 'changed'), COUNT(*) FILTER (WHERE change = 'new')
  INTO n_changed, n_added FROM vendor_changes;

  UPDATE products
  SET list_cents        = (SELECT c.new_list_cents        FROM vendor_changes c WHERE c.sku = products.sku),
      cost_cents        = (SELECT c.new_cost_cents        FROM vendor_changes c WHERE c.sku = products.sku),
      outlet_cost_cents = (SELECT c.new_outlet_cost_cents FROM vendor_changes c WHERE c.sku = products.sku),
      outlet_list_cents = (SELECT CASE WHEN c.new_outlet_cost_cents IS NULL THEN NULL
                                       ELSE CAST(ROUND(c.new_list_cents * 0.8) AS INTEGER) END
                           FROM vendor_changes c WHERE c.sku = products.sku)
  WHERE sku IN (SELECT sku FROM vendor_changes WHERE change = 'changed');

  INSERT INTO products (sku, model_sku, brand, model, category, size, list_cents, cost_cents,
                        outlet_list_cents, outlet_cost_cents)
  SELECT sku, model_sku, brand, model, category, size, new_list_cents, new_cost_cents,
         CASE WHEN new_outlet_cost_cents IS NULL THEN NULL ELSE CAST(ROUND(new_list_cents * 0.8) AS INTEGER) END,
         new_outlet_cost_cents
  FROM vendor_changes
  WHERE change = 'new';

  DROP TABLE vendor_changes;
  RETURN jsonb_build_object('changed', n_changed, 'added', n_added);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_outcome(JSONB), public.save_settings(JSONB), public.apply_catalog_changes(JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_outcome(JSONB), public.save_settings(JSONB), public.apply_catalog_changes(JSONB)
  TO service_role;

-- The server function reads with the server's key: who is asking (profiles), the
-- rules in force and the catalog, to price a sale again before saving it.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO service_role;
