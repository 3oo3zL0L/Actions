Rails.application.routes.draw do
  resource :first_run, only: %i[ new create ]
  resource :session

  resources :captures, only: :create

  resources :items, only: %i[ index show edit update ] do
    scope module: :items do
      resource :completion, only: %i[ create destroy ]
      resource :drop, only: %i[ create destroy ]
      resource :priority, only: %i[ create destroy ]
      resource :rewrite, only: :create
    end
  end

  resources :proposals, only: :create do
    scope module: :proposals do
      resource :acceptance, only: %i[ create destroy ]
      resource :dismissal, only: %i[ create destroy ]
    end
  end

  resource :import, only: %i[ new create ]

  resource :desk, only: :show
  resources :programs, only: %i[ index show edit update ]

  resources :entries, only: [] do
    resource :action, only: :create, module: :entries
  end

  resources :sources, only: %i[ index create destroy ] do
    resource :sync, only: :create, module: :sources
  end
  resource :sync, only: :create

  scope "sources/:provider", constraints: { provider: /microsoft|atlassian/ } do
    resource :authorization, only: %i[ new show ], module: :sources
  end

  get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker
  get "up" => "rails/health#show", as: :rails_health_check

  root "desks#show"
end
