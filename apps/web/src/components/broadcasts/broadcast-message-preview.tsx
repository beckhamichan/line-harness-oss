import FlexPreviewComponent from '@/components/flex-preview'
import type { ApiBroadcastMessage } from '@/lib/api'

interface BroadcastMessagePreviewProps {
  message: ApiBroadcastMessage
}

export default function BroadcastMessagePreview({ message }: BroadcastMessagePreviewProps) {
  if (!message.content.trim()) {
    return <p className="text-xs text-gray-400">内容を入力するとプレビューが表示されます</p>
  }

  if (message.type === 'flex') {
    try {
      JSON.parse(message.content)
      return <FlexPreviewComponent content={message.content} maxWidth={300} />
    } catch {
      return <p className="text-xs text-red-500">Flex JSONを確認してください</p>
    }
  }

  if (message.type === 'image') {
    try {
      const image = JSON.parse(message.content) as { originalContentUrl?: string }
      if (!image.originalContentUrl) throw new Error('missing originalContentUrl')
      return <img src={image.originalContentUrl} alt="" className="max-w-[300px] rounded-lg" />
    } catch {
      return <p className="text-xs text-gray-400">画像プレビュー不可</p>
    }
  }

  return (
    <div className="bg-green-500 text-white rounded-2xl rounded-tl-sm px-4 py-3 max-w-[300px] text-sm whitespace-pre-wrap">
      {message.content}
    </div>
  )
}
