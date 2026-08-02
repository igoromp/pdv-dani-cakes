import { useEffect, useState, useCallback } from 'react'
import { Product, Category, CartItem, formatPriceLabel } from '../types'
import PaymentModal, { PaymentLine } from '../components/PaymentModal'
import { CalendarPlusIcon, CloseIcon, MinusIcon, PlusIcon, SearchIcon } from '../components/icons'

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const pad = (n: number) => String(n).padStart(2, '0')

// 'YYYY-MM-DDTHH:MM' no fuso local — formato do input datetime-local.
const localDateTime = (date = new Date()) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`

// Contador local só para dar chave às linhas do carrinho — itens avulsos não têm
// product_id e dois deles podem coexistir com a mesma descrição.
let nextLineId = 1

interface Props {
  /** Lançamento retroativo: exige data/hora da venda e grava marcada como retroativa. */
  backdated?: boolean
}

export default function POS({ backdated = false }: Props) {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [showPayment, setShowPayment] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [paymentError, setPaymentError] = useState('')
  const [weighingProduct, setWeighingProduct] = useState<Product | null>(null)
  const [weightInput, setWeightInput] = useState('')
  const [saleDateTime, setSaleDateTime] = useState(() => localDateTime())
  const [showCustomItem, setShowCustomItem] = useState(false)
  const [customLabel, setCustomLabel] = useState('')
  const [customValue, setCustomValue] = useState('')
  // Texto cru do campo de quantidade enquanto está sendo digitado. Sem isso,
  // apagar o campo para digitar "12" seria lido como quantidade inválida no
  // meio da digitação.
  const [qtyDrafts, setQtyDrafts] = useState<Record<number, string>>({})

  const loadData = useCallback(async () => {
    const [prods, cats] = await Promise.all([
      window.api.products.list(),
      window.api.categories.list()
    ])
    setProducts(prods)
    setCategories(cats)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const cartTotal = cart.reduce((sum, i) => sum + i.subtotal, 0)

  const filtered = products.filter(p =>
    p.active &&
    (selectedCategory === null || p.category_id === selectedCategory) &&
    (search === '' || p.name.toLowerCase().includes(search.toLowerCase()))
  )

  const addLine = (product: Product, qty: number) => {
    setCart(prev => {
      const existing = prev.find(i => i.product_id === product.id)
      if (existing) {
        const newQty = existing.quantity + qty
        return prev.map(i =>
          i.product_id === product.id
            ? { ...i, quantity: newQty, subtotal: newQty * i.unit_price }
            : i
        )
      }
      return [...prev, {
        line_id: nextLineId++,
        product_id: product.id,
        product_name: product.name,
        unit_price: product.price,
        quantity: qty,
        subtotal: qty * product.price,
        unit_type: product.unit_type,
        pack_size: product.pack_size
      }]
    })
  }

  // Item avulso: valor digitado na hora, sem produto cadastrado. Nunca funde com
  // uma linha existente — dois lançamentos avulsos são coisas diferentes.
  const confirmCustomItem = () => {
    const value = parseFloat(customValue.replace(',', '.'))
    if (!Number.isFinite(value) || value <= 0) return
    setCart(prev => [...prev, {
      line_id: nextLineId++,
      product_name: customLabel.trim() || 'Item avulso',
      unit_price: value,
      quantity: 1,
      subtotal: value,
      unit_type: 'unit',
      pack_size: null
    }])
    setShowCustomItem(false)
    setCustomLabel('')
    setCustomValue('')
  }

  const handleProductClick = (product: Product) => {
    if (product.unit_type === 'kg') {
      setWeighingProduct(product)
      setWeightInput('')
      return
    }
    addLine(product, 1)
  }

  const confirmWeight = () => {
    if (!weighingProduct) return
    const weight = parseFloat(weightInput.replace(',', '.'))
    if (!weight || weight <= 0) return
    addLine(weighingProduct, weight)
    setWeighingProduct(null)
    setWeightInput('')
  }

  const setQuantity = (lineId: number, quantity: number) => {
    setCart(prev => prev.map(i =>
      i.line_id === lineId ? { ...i, quantity, subtotal: quantity * i.unit_price } : i
    ))
  }

  const removeLine = (lineId: number) => {
    setCart(prev => prev.filter(i => i.line_id !== lineId))
    setQtyDrafts(drafts => {
      const next = { ...drafts }
      delete next[lineId]
      return next
    })
  }

  const incrementQty = (item: CartItem, delta: number) => {
    const newQty = Number((item.quantity + delta).toFixed(3))
    if (newQty <= 0) {
      removeLine(item.line_id)
      return
    }
    setQtyDrafts(drafts => {
      const next = { ...drafts }
      delete next[item.line_id]
      return next
    })
    setQuantity(item.line_id, newQty)
  }

  // Enquanto digita, só grava no carrinho o que já é um número válido; o resto
  // fica no rascunho. Ao sair do campo o rascunho some e o input volta a espelhar
  // a quantidade real — apagar tudo e desistir não apaga a linha.
  const handleQtyInput = (item: CartItem, text: string) => {
    setQtyDrafts(drafts => ({ ...drafts, [item.line_id]: text }))
    const parsed = parseFloat(text.replace(',', '.'))
    if (Number.isFinite(parsed) && parsed > 0) {
      setQuantity(item.line_id, item.unit_type === 'kg' ? parsed : Math.floor(parsed))
    }
  }

  const handleQtyBlur = (item: CartItem) => {
    setQtyDrafts(drafts => {
      const next = { ...drafts }
      delete next[item.line_id]
      return next
    })
  }

  const handleSaleComplete = async (payments: PaymentLine[]) => {
    setPaymentError('')
    try {
      if (backdated) {
        await window.api.sales.createBackdated({
          total: cartTotal,
          items: cart,
          payments,
          created_at: saleDateTime
        })
      } else {
        await window.api.sales.create({
          total: cartTotal,
          items: cart,
          payments
        })
      }
      setCart([])
      setShowPayment(false)
      setSuccessMsg(
        backdated
          ? `Venda lançada em ${new Date(saleDateTime).toLocaleString('pt-BR')}.`
          : 'Venda registrada com sucesso!'
      )
      setTimeout(() => setSuccessMsg(''), 4000)
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : 'Erro ao registrar a venda. Tente novamente.')
    }
  }

  const isFutureDate = backdated && saleDateTime > localDateTime()
  const canFinalize = cart.length > 0 && (!backdated || (saleDateTime !== '' && !isFutureDate))

  return (
    <div className="flex flex-col h-full">
      {backdated && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-center gap-3 flex-wrap shrink-0">
          <div className="flex items-center gap-2 text-amber-900">
            <CalendarPlusIcon className="w-5 h-5" aria-hidden="true" />
            <span className="text-sm font-semibold">Lançamento retroativo</span>
          </div>
          <span className="text-xs text-amber-800">
            A venda será gravada com a data e a hora informadas ao lado, e ficará marcada como retroativa no histórico.
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <label htmlFor="sale-datetime" className="text-xs font-medium text-amber-900">Data/hora da venda</label>
            <input
              id="sale-datetime"
              type="datetime-local"
              value={saleDateTime}
              max={localDateTime()}
              onChange={e => setSaleDateTime(e.target.value)}
              className="px-3 py-2 min-h-[40px] border border-amber-300 bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          {isFutureDate && (
            <p className="w-full text-xs font-medium text-red-700">
              A data informada está no futuro. Escolha uma data igual ou anterior a agora.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
      {/* Product grid */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-200">
        <div className="px-4 py-3 border-b border-gray-200 bg-white space-y-2.5">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar produto..."
                aria-label="Buscar produto"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <button
              onClick={() => { setCustomLabel(''); setCustomValue(''); setShowCustomItem(true) }}
              title="Lançar um valor livre, sem produto cadastrado"
              className="px-4 py-2.5 min-h-[44px] shrink-0 border border-rose-200 text-rose-700 rounded-lg text-sm font-semibold hover:bg-rose-50 cursor-pointer"
            >
              + Valor avulso
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-0.5">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-4 py-2 min-h-[36px] rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer
                ${selectedCategory === null ? 'bg-rose-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              Todos
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-4 py-2 min-h-[36px] rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer
                  ${selectedCategory === cat.id ? 'bg-rose-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <div className="text-center text-gray-400 py-20">
              {search ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado'}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filtered.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleProductClick(p)}
                  className="bg-white border border-gray-200 rounded-xl p-3.5 min-h-[92px] text-left hover:border-rose-400 hover:shadow-md transition-all active:scale-95 cursor-pointer"
                >
                  <div className="text-[15px] font-semibold text-gray-800 leading-tight mb-1">{p.name}</div>
                  {p.category_name && <div className="text-xs text-gray-500 mb-2">{p.category_name}</div>}
                  <div className="text-lg font-bold text-rose-600">{formatPriceLabel(p.price, p.unit_type, p.pack_size)}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cart */}
      <div className="w-80 flex flex-col bg-white shrink-0">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Carrinho</h2>
          {cart.length > 0 && (
            <button
              onClick={() => setCart([])}
              className="text-xs font-medium text-gray-500 hover:text-red-600 min-h-[36px] px-2 rounded-lg hover:bg-red-50 cursor-pointer"
            >
              Limpar
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {successMsg && (
            <div className="m-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 font-medium text-center">
              {successMsg}
            </div>
          )}
          {cart.length === 0 ? (
            <div className="text-center text-gray-400 py-16 text-sm">
              Adicione produtos ao carrinho
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {cart.map(item => {
                const isWeight = item.unit_type === 'kg'
                const unitSuffix = isWeight ? 'kg' : item.unit_type === 'pack' ? `pct. de ${item.pack_size} un.` : 'un.'
                return (
                  <div key={item.line_id} className="px-4 py-3">
                    <div className="flex justify-between items-start mb-1.5">
                      <span className="text-sm font-medium text-gray-800 flex-1 pr-2 leading-tight">
                        {item.product_name}
                        {!item.product_id && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 text-[10px] font-semibold uppercase tracking-wide align-middle">
                            avulso
                          </span>
                        )}
                      </span>
                      <button
                        onClick={() => removeLine(item.line_id)}
                        aria-label={`Remover ${item.product_name} do carrinho`}
                        className="w-8 h-8 -mt-1 -mr-1 shrink-0 flex items-center justify-center rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                      >
                        <CloseIcon className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => incrementQty(item, isWeight ? -0.1 : -1)}
                          aria-label={`Diminuir quantidade de ${item.product_name}`}
                          className="w-9 h-9 shrink-0 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center cursor-pointer"
                        ><MinusIcon className="w-4 h-4" /></button>
                        <input
                          type="number"
                          inputMode="decimal"
                          step={isWeight ? 0.1 : 1}
                          min={isWeight ? 0.001 : 1}
                          aria-label={
                            isWeight
                              ? `Peso de ${item.product_name} em quilos`
                              : `Quantidade de ${item.product_name}`
                          }
                          value={qtyDrafts[item.line_id] ?? String(item.quantity)}
                          onChange={e => handleQtyInput(item, e.target.value)}
                          onBlur={() => handleQtyBlur(item)}
                          onFocus={e => e.target.select()}
                          className="w-16 px-2 py-2 min-h-[40px] border border-gray-300 rounded-lg text-sm text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-rose-500"
                        />
                        <button
                          onClick={() => incrementQty(item, isWeight ? 0.1 : 1)}
                          aria-label={`Aumentar quantidade de ${item.product_name}`}
                          className="w-9 h-9 shrink-0 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center cursor-pointer"
                        ><PlusIcon className="w-4 h-4" /></button>
                        <span className="text-xs text-gray-500 ml-0.5 whitespace-nowrap">{unitSuffix}</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-800 tabular-nums shrink-0">{fmt(item.subtotal)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <span className="text-lg font-semibold text-gray-800">Total</span>
            <span className="text-2xl font-bold text-rose-600">{fmt(cartTotal)}</span>
          </div>
          <button
            onClick={() => setShowPayment(true)}
            disabled={!canFinalize}
            className="w-full py-3 bg-rose-600 text-white font-semibold rounded-xl hover:bg-rose-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {backdated ? 'Lançar Venda' : 'Finalizar Venda'}
          </button>
        </div>
      </div>
      </div>

      {weighingProduct && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-80 overflow-hidden">
            <div className="bg-rose-600 px-6 py-4">
              <h2 className="text-white font-bold text-lg">{weighingProduct.name}</h2>
              <p className="text-rose-100 text-sm">{fmt(weighingProduct.price)} / kg</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Peso (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  autoFocus
                  value={weightInput}
                  onChange={e => setWeightInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && confirmWeight()}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl text-lg font-semibold focus:outline-none focus:border-rose-500"
                  placeholder="0,000"
                />
              </div>
              {parseFloat(weightInput.replace(',', '.')) > 0 && (
                <div className="text-sm text-gray-600 text-right">
                  Subtotal: <span className="font-bold text-rose-600">
                    {fmt(parseFloat(weightInput.replace(',', '.')) * weighingProduct.price)}
                  </span>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setWeighingProduct(null)}
                  className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmWeight}
                  disabled={!(parseFloat(weightInput.replace(',', '.')) > 0)}
                  className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-semibold hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Adicionar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCustomItem && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-80 overflow-hidden">
            <div className="bg-rose-600 px-6 py-4">
              <h2 className="text-white font-bold text-lg">Valor avulso</h2>
              <p className="text-rose-100 text-sm">Para o que não está no cadastro de produtos</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label htmlFor="custom-label" className="text-sm font-medium text-gray-700 mb-2 block">
                  Descrição
                </label>
                <input
                  id="custom-label"
                  type="text"
                  value={customLabel}
                  onChange={e => setCustomLabel(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && confirmCustomItem()}
                  placeholder="Item avulso"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl text-sm focus:outline-none focus:border-rose-500"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Aparece assim no histórico e no relatório de produtos.
                </p>
              </div>
              <div>
                <label htmlFor="custom-value" className="text-sm font-medium text-gray-700 mb-2 block">
                  Valor (R$)
                </label>
                <input
                  id="custom-value"
                  type="number"
                  step="0.01"
                  min={0}
                  autoFocus
                  value={customValue}
                  onChange={e => setCustomValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && confirmCustomItem()}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl text-lg font-semibold focus:outline-none focus:border-rose-500"
                  placeholder="0,00"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowCustomItem(false)}
                  className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmCustomItem}
                  disabled={!(parseFloat(customValue.replace(',', '.')) > 0)}
                  className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-semibold hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Adicionar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPayment && (
        <PaymentModal
          total={cartTotal}
          error={paymentError}
          onConfirm={handleSaleComplete}
          onCancel={() => { setShowPayment(false); setPaymentError('') }}
        />
      )}
    </div>
  )
}
