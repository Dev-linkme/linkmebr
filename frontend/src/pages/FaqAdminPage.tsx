import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import {
  HelpCircle,
  Plus,
  Pencil,
  Trash2,
  GripVertical,
  X,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import api from '../services/api';
import type { Faq } from '../types/index.ts';

type Lang = 'pt' | 'en' | 'es';

interface FaqFormData {
  pergunta_pt: string;
  resposta_pt: string;
  pergunta_en: string;
  resposta_en: string;
  pergunta_es: string;
  resposta_es: string;
}

const LANG_LABELS: Record<Lang, string> = {
  pt: 'Português',
  en: 'English',
  es: 'Español',
};

// ─── Sortable Row ────────────────────────────────────────────────────────────

interface SortableRowProps {
  faq: Faq;
  onEdit: (faq: Faq) => void;
  onDelete: (id: number) => void;
  onToggleStatus: (faq: Faq) => void;
}

function SortableRow({ faq, onEdit, onDelete, onToggleStatus }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: faq.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr ref={setNodeRef} style={style} className="hover:bg-gray-50">
      <td className="px-3 py-3 text-sm text-gray-400 w-8">
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 flex items-center"
        >
          <GripVertical size={16} />
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-500 w-12">{faq.ordem}</td>
      <td className="px-4 py-3 text-sm text-gray-900">{faq.pergunta_pt}</td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
            faq.status === 'publicado'
              ? 'bg-green-100 text-green-800'
              : 'bg-yellow-100 text-yellow-800'
          }`}
        >
          {faq.status === 'publicado' ? 'Publicado' : 'Rascunho'}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => onEdit(faq)}
            title="Editar"
            className="text-gray-500 hover:text-green-600 p-1 rounded"
          >
            <Pencil size={16} />
          </button>
          <button
            onClick={() => onToggleStatus(faq)}
            title={faq.status === 'publicado' ? 'Mover para rascunho' : 'Publicar'}
            className="text-gray-500 hover:text-blue-600 p-1 rounded"
          >
            {faq.status === 'publicado' ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <button
            onClick={() => onDelete(faq.id)}
            title="Excluir"
            className="text-gray-500 hover:text-red-600 p-1 rounded"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function FaqAdminPage() {
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [activeLang, setActiveLang] = useState<Lang>('pt');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const sensors = useSensors(useSensor(PointerSensor));

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FaqFormData>();

  const fetchFaqs = async () => {
    try {
      setLoading(true);
      const res = await api.get<{ data: Faq[] }>('/admin/faq');
      const lista = res.data.data ?? [];
      setFaqs(lista.slice().sort((a, b) => a.ordem - b.ordem));
    } catch {
      toast.error('Erro ao carregar FAQ.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFaqs();
  }, []);

  const openNew = () => {
    setEditingId(null);
    reset({
      pergunta_pt: '',
      resposta_pt: '',
      pergunta_en: '',
      resposta_en: '',
      pergunta_es: '',
      resposta_es: '',
    });
    setActiveLang('pt');
    setShowForm(true);
  };

  const openEdit = (faq: Faq) => {
    setEditingId(faq.id);
    reset({
      pergunta_pt: faq.pergunta_pt,
      resposta_pt: faq.resposta_pt,
      pergunta_en: faq.pergunta_en,
      resposta_en: faq.resposta_en,
      pergunta_es: faq.pergunta_es,
      resposta_es: faq.resposta_es,
    });
    setActiveLang('pt');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    reset();
  };

  const onSubmit = async (data: FaqFormData) => {
    try {
      if (editingId !== null) {
        await api.put(`/admin/faq/${editingId}`, data);
        toast.success('FAQ atualizado com sucesso.');
      } else {
        await api.post('/admin/faq', data);
        toast.success('FAQ criado com sucesso.');
      }
      closeForm();
      fetchFaqs();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Erro ao salvar FAQ.';
      toast.error(msg);
    }
  };

  const handleToggleStatus = async (faq: Faq) => {
    const novoStatus = faq.status === 'publicado' ? 'rascunho' : 'publicado';
    try {
      await api.patch(`/admin/faq/${faq.id}/status`, { status: novoStatus });
      toast.success(
        novoStatus === 'publicado' ? 'FAQ publicado.' : 'FAQ movido para rascunho.'
      );
      fetchFaqs();
    } catch {
      toast.error('Erro ao alterar status do FAQ.');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/admin/faq/${id}`);
      toast.success('FAQ excluído.');
      setConfirmDeleteId(null);
      fetchFaqs();
    } catch {
      toast.error('Erro ao excluir FAQ.');
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = faqs.findIndex((f) => f.id === active.id);
    const newIndex = faqs.findIndex((f) => f.id === over.id);

    const reordered = arrayMove(faqs, oldIndex, newIndex).map((f, idx) => ({
      ...f,
      ordem: idx + 1,
    }));

    // Optimistic update
    setFaqs(reordered);

    // Persist the moved item's new ordem
    const movedFaq = reordered[newIndex];
    try {
      await api.patch(`/admin/faq/${movedFaq.id}/ordem`, { ordem: movedFaq.ordem });
    } catch {
      toast.error('Erro ao salvar nova ordem. Recarregando...');
      fetchFaqs();
    }
  };

  const langs: Lang[] = ['pt', 'en', 'es'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <HelpCircle size={28} className="text-green-600" />
          <h1 className="text-2xl font-bold text-gray-900">FAQ</h1>
        </div>
        {!showForm && (
          <button
            onClick={openNew}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
          >
            <Plus size={16} />
            Nova Entrada
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">
              {editingId !== null ? 'Editar FAQ' : 'Nova Entrada FAQ'}
            </h2>
            <button onClick={closeForm} className="text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
          </div>

          {/* Language tabs */}
          <div className="flex border-b border-gray-200 mb-4">
            {langs.map((lang) => {
              const hasError =
                lang === 'pt'
                  ? !!(errors.pergunta_pt || errors.resposta_pt)
                  : lang === 'en'
                  ? !!(errors.pergunta_en || errors.resposta_en)
                  : !!(errors.pergunta_es || errors.resposta_es);
              return (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setActiveLang(lang)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeLang === lang
                      ? 'border-green-600 text-green-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  } ${hasError ? 'text-red-500' : ''}`}
                >
                  {LANG_LABELS[lang]}
                  {hasError && <span className="ml-1 text-red-500">*</span>}
                </button>
              );
            })}
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* PT */}
            <div className={activeLang === 'pt' ? '' : 'hidden'}>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Pergunta (Português) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    {...register('pergunta_pt', { required: 'Pergunta em português é obrigatória.' })}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  {errors.pergunta_pt && (
                    <p className="text-red-500 text-xs mt-1">{errors.pergunta_pt.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Resposta (Português) <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={5}
                    {...register('resposta_pt', { required: 'Resposta em português é obrigatória.' })}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-y"
                  />
                  {errors.resposta_pt && (
                    <p className="text-red-500 text-xs mt-1">{errors.resposta_pt.message}</p>
                  )}
                </div>
              </div>
            </div>

            {/* EN */}
            <div className={activeLang === 'en' ? '' : 'hidden'}>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Question (English) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    {...register('pergunta_en', { required: 'Question in English is required.' })}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  {errors.pergunta_en && (
                    <p className="text-red-500 text-xs mt-1">{errors.pergunta_en.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Answer (English) <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={5}
                    {...register('resposta_en', { required: 'Answer in English is required.' })}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-y"
                  />
                  {errors.resposta_en && (
                    <p className="text-red-500 text-xs mt-1">{errors.resposta_en.message}</p>
                  )}
                </div>
              </div>
            </div>

            {/* ES */}
            <div className={activeLang === 'es' ? '' : 'hidden'}>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Pregunta (Español) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    {...register('pergunta_es', { required: 'Pregunta en español es obligatoria.' })}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  {errors.pergunta_es && (
                    <p className="text-red-500 text-xs mt-1">{errors.pergunta_es.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Respuesta (Español) <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={5}
                    {...register('resposta_es', { required: 'Respuesta en español es obligatoria.' })}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-y"
                  />
                  {errors.resposta_es && (
                    <p className="text-red-500 text-xs mt-1">{errors.resposta_es.message}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={closeForm}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded disabled:opacity-60"
              >
                {isSubmitting ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Drag-and-drop list */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <span className="text-gray-500">Carregando...</span>
          </div>
        ) : faqs.length === 0 ? (
          <div className="flex justify-center items-center py-12">
            <span className="text-gray-500">Nenhuma entrada de FAQ cadastrada.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 w-8" />
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                    Ordem
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pergunta (PT)
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={faqs.map((f) => f.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <tbody className="bg-white divide-y divide-gray-200">
                    {faqs.map((faq) => (
                      <SortableRow
                        key={faq.id}
                        faq={faq}
                        onEdit={openEdit}
                        onDelete={(id) => setConfirmDeleteId(id)}
                        onToggleStatus={handleToggleStatus}
                      />
                    ))}
                  </tbody>
                </SortableContext>
              </DndContext>
            </table>
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {confirmDeleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Confirmar exclusão</h3>
            <p className="text-sm text-gray-600 mb-6">
              Tem certeza que deseja excluir esta entrada FAQ? Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(confirmDeleteId)}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
