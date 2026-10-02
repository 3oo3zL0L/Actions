Rails.application.routes.draw do
  resource :first_run, only: %i[ new create ]
  resource :session

  get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker
  get "up" => "rails/health#show", as: :rails_health_check

  root "queues#show"
end
