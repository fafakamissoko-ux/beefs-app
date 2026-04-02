-- Realtime : inclure l’ancienne ligne sur UPDATE (nécessaire pour ne pas déclencher
-- « beef terminé / live » à chaque modification de feed_position, is_featured, etc.)
ALTER TABLE public.beefs REPLICA IDENTITY FULL;
