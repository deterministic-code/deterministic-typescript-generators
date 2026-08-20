export const PARENT_CHILD_EAGER_YAML: Record<string, string> = {
  "settings.yaml": `settings:
  datasource:
    id_type: integer
    pluralize_datatable_names: true
`,
  "backend-app.yaml": `middleware: []
handlers: []
`,
  "datasource_types.yaml": `types:
  - status:
      datasource_type: readonly-lookup
      fields:
        - name:
            type: string
            is_unique: true
  - project:
      fields:
        - name:
            type: string
            is_unique: true
  - task:
      fields:
        - title:
            type: string
        - project_id:
            type: number
            references: project.id
        - status_id:
            type: number
            references: status.id
`,
  "datasource_seeds.yaml": `seeds:
  - status:
      - id1:
          name: active
      - id2:
          name: archived
`,
  "view_types.yaml": `includes:
  - datasource_types:
      include: "*"
      auto_enrich: true
types:
  - project:
      inherits: datasource_types.project
      fields:
        - tasks:
            type: datasource_types.task[]
            references: datasource_types.task.project_id
`,
  "services.yaml": `includes:
  - view_type_services:
      filter: 'type is view_type || type is datasource_type'
services: []
`,
  "routes.yaml": `includes:
  - view_type_routes:
      filter: 'type inherits datasource_types'
      eager_path:
        - project.tasks
      eager_write_path:
        - project.tasks
routes:
  - get_projects_by_name:
`,
};

export const PARENT_CHILD_SETTINGS: Record<string, string> = {
  application_name: "parent-child-e2e",
  app_generate_complexity: "deterministic",
  "datasource.id_type": "integer",
  "datasource.pluralize_datatable_names": "true",
  "backend.datasources": "sqlite",
};
