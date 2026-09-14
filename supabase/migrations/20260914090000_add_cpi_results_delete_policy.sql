-- Adminpanelen får en radera-funktion för felaktiga/testrader i Kompetensindex-rapporterna.
-- cpi_results hade sedan tidigare bara INSERT (public) och SELECT (is_admin()) - ingen DELETE-policy.

CREATE POLICY "Admins can delete cpi_results" ON cpi_results
  FOR DELETE USING (is_admin());
