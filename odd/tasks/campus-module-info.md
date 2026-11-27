# Campus period dates and module info
"Sincronizar cursos" also reads, from each Campus grading form ("Calificar"), the opening/closing date of each corte and the "Componentes de módulo asociados a este grupo" table; the home screen shows the corte dates and each course card shows Faltas pierde, Habilitable and Créditos.
Branch `feature/campus-module-info` (from `main` at 502e3f7). Built and tried in NOTAZOD Test only.

## Specs
- S1: User: "quiero que las fehcas de ciere y de apertura este e ngenral en la pantalla pirniapl y y la infmroamco de horas de modulo de perdida por falta recuerpable o no apasres en latarejta de cada materie [Image#1] para cuando se sinornice lo haga". The data is read during "Sincronizar cursos" (never typed by hand).
- S2: Source (user: "Formulario 'Calificar' del grupo"): the grading form of each group, which the sync already opens, shows three boxes with the exact text "Apertura Corte 1: 12/09/2026" / "Cierre Corte 1: 27/09/2026", "Apertura Corte 2: 24/10/2026" / "Cierre Corte 2: 08/11/2026", "Apertura Corte 3: 16/11/2026" / "Cierre Corte 3: 01/12/2026" (dates dd/mm/yyyy), and below "Componentes de módulo asociados a este grupo." a table with headers "Comp. Módulo | Habilitable | Cred. | Faltas Pierde | % Corte 1 | % Corte 2 | % Corte 3 | Plan Est." and rows such as "LABORATORIO DE PROGRAMACIÓN | NO | 2 | 7 | 30 | 35 | 35 | INGENIERIA_2023". Columns are found by header text (accent/case-insensitive), like the existing readers. A missing box or table never breaks the sync: the values stay empty and the rest of the sync works as today.
- S3: The values are stored locally per synced Campus group with an additive schema change (new nullable columns or table; existing data untouched) and refreshed on every sync, also for courses that already exist (an "add" action with no students to add still updates them).
- S4: Home screen (pantalla principal): a general strip with the three cortes, each "Corte N" with "Apertura dd/mm/yyyy" and "Cierre dd/mm/yyyy", using the dates of the current-semester synced groups. The corte whose range contains today is marked as open (green, like the Campus); past ones as closed; future ones as upcoming. Not shown when no synced group has dates.
- S5: Each course card on the home screen (user chose: "Faltas pierde (horas)", "Habilitable (recuperable sí/no)", "Créditos") shows e.g. "Pierde con 7 h de falta · Habilitable: No · 2 créditos". Courses without synced module info show nothing extra. Works at ~820px wide, dark and light themes, colors only from tokens.

## Tasks
- T1 (S1-S3) Read dates and components in the grading form during sync, pure parsing helpers with tests, store them (additive schema). Route: worker. Commit: pending
- T2 (S4, S5) Home dates strip and course card module info. Route: worker. Commit: pending
- T3 Try in NOTAZOD Test with a real sync, update docs. Route: inline + user. Commit: pending

## Log
- L1: "quiero que las fehcas de ciere y de apertura este e ngenral en la pantalla pirniapl y y la infmroamco de horas de modulo de perdida por falta recuerpable o no apasres en latarejta de cada materie [Image#1] para cuando se sinornice lo haga" (screenshot of the Campus boxes and components table quoted in S2).
- L2: Decisions (user): source page is the "Calificar" grading form; card shows Faltas pierde, Habilitable and Créditos (not % per corte).
